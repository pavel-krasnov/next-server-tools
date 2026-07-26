import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it } from "node:test";
import { createHttpApp } from "../../src/extension/http-app.js";
import { emptyRegistry } from "../../src/extension/registry.js";
import type {
	Context,
	ExtensionRegistry,
	Logger,
	MiddlewareDefinition,
	MiddlewareFn,
	NextFn,
} from "../../src/extension/types.js";

const noopLog: Logger = {
	info() {},
	warn() {},
	error() {},
	debug() {},
};

function createMockReqRes(pathname = "/"): {
	req: IncomingMessage;
	res: ServerResponse;
} {
	const res = {
		statusCode: 200,
		headersSent: false,
		writableEnded: false,
		setHeader() {},
		end() {
			res.writableEnded = true;
			res.headersSent = true;
		},
	};

	const req = {
		method: "GET",
		url: pathname,
		headers: { host: "localhost:3000" },
	};

	return {
		req: req as IncomingMessage,
		res: res as unknown as ServerResponse,
	};
}

async function createApp(options: {
	middlewares?: MiddlewareDefinition[];
	nextHandler?: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
	onFinish?: (ctx: Context) => void;
}) {
	const registry: ExtensionRegistry = {
		...emptyRegistry(),
		middlewares: options.middlewares ?? [],
		hooks: options.onFinish
			? [
					{
						name: "request:finish" as const,
						order: 100,
						handler: async ({ ctx }: { ctx: Context }) => {
							options.onFinish?.(ctx);
						},
					},
				]
			: [],
	};

	return createHttpApp({
		registry,
		config: {
			dir: "/tmp",
			hostname: "localhost",
			port: 3000,
			https: false,
			dev: true,
			shutdownTimeoutMs: 10_000,
		},
		nextHandler:
			options.nextHandler ??
			(async (_req, res) => {
				res.end("next");
			}),
		log: noopLog,
	});
}

describe("createHttpApp meta", () => {
	it("leaves hitNext false when middleware does not call next", async () => {
		let finishMeta: Context["meta"] | undefined;
		const healthz: MiddlewareFn = async (ctx) => {
			await ctx.res.end("ok");
		};
		const app = await createApp({
			middlewares: [
				{
					name: "healthz",
					order: 10,
					role: "normal",
					handler: healthz,
				},
			],
			nextHandler: async () => {
				assert.fail("Next should not run on short-circuit");
			},
			onFinish: (ctx) => {
				finishMeta = ctx.meta;
			},
		});

		const { req, res } = createMockReqRes("/healthz");
		await app.handle(req, res);

		assert.deepEqual(finishMeta, { hitNext: false });
	});

	it("sets hitNext when the Next handler runs", async () => {
		let finishMeta: Context["meta"] | undefined;
		let nextCalled = false;
		const pass: MiddlewareFn = async (_ctx: Context, next: NextFn) => {
			await next();
		};
		const app = await createApp({
			middlewares: [
				{
					name: "pass",
					order: 10,
					role: "normal",
					handler: pass,
				},
			],
			nextHandler: async (_req, res) => {
				nextCalled = true;
				res.end("next");
			},
			onFinish: (ctx) => {
				finishMeta = ctx.meta;
			},
		});

		const { req, res } = createMockReqRes("/");
		await app.handle(req, res);

		assert.equal(nextCalled, true);
		assert.deepEqual(finishMeta, { hitNext: true });
	});
});
