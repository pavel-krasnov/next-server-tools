import type { IncomingMessage, ServerResponse } from "node:http";
import { composeMiddleware } from "./compose.js";
import { createContext } from "./context.js";
import { type PreparedExtensions, prepareExtensions } from "./registry.js";
import type {
	Context,
	ExtensionRegistry,
	Logger,
	NodeHandler,
	RuntimeConfig,
	RuntimeHandle,
} from "./types.js";

export type HttpApp = {
	handle: NodeHandler;
	prepared: PreparedExtensions;
	runtime: RuntimeHandle;
	hooks: PreparedExtensions["hooks"];
	setUrl: (url: string) => void;
};

export async function createHttpApp(options: {
	registry: ExtensionRegistry;
	config: RuntimeConfig;
	nextHandler: NodeHandler;
	log: Logger;
}): Promise<HttpApp> {
	const { log } = options;
	const services = new Map<string, unknown>();
	let url: string | undefined;

	const runtime: RuntimeHandle = {
		extensionApiVersion: 1,
		get url() {
			return url;
		},
		dir: options.config.dir,
		dev: options.config.dev,
		get: <T = unknown>(key: string) => services.get(key) as T | undefined,
	};

	const prepared = await prepareExtensions(options.registry, {
		config: options.config,
		runtime,
		services,
	});

	const final = async (ctx: Context) => {
		ctx.meta = { ...ctx.meta, hitNext: true };
		await prepared.hooks.emit("next:before", { ctx });
		// Flush Context response headers/status onto the Node response before Next.
		ctx.res.raw.statusCode = ctx.res.status;
		ctx.res.headers.forEach((value, key) => {
			ctx.res.raw.setHeader(key, value);
		});
		await options.nextHandler(ctx.req.raw, ctx.res.raw);
		await prepared.hooks.emit("next:after", { ctx });
	};

	const pipeline = composeMiddleware(prepared.middlewares, final);

	const handle: NodeHandler = async (req, res) => {
		const protocol = options.config.https ? "https" : "http";
		const origin =
			url ?? `${protocol}://${options.config.hostname}:${options.config.port}`;
		const ctx = createContext({
			req,
			res,
			config: options.config,
			runtime,
			log,
			origin,
		});

		try {
			await prepared.hooks.emit("request:start", { ctx });
			await pipeline(ctx);
			await prepared.hooks.emit("response:sent", { ctx });
			await prepared.hooks.emit("request:finish", { ctx });
		} catch (error) {
			await prepared.hooks.emit("request:error", { ctx, error });
			if (!res.headersSent && !res.writableEnded) {
				res.statusCode = 500;
				res.end("Internal Server Error");
			}
			ctx.log.error("request failed", {
				id: ctx.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	};

	return {
		handle,
		prepared,
		runtime,
		hooks: prepared.hooks,
		setUrl(value: string) {
			url = value;
		},
	};
}

export function wrapNodeHandler(
	handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): NodeHandler {
	return async (req, res) => {
		await handler(req, res);
	};
}
