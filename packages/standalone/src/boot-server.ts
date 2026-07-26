import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { createHttpApp } from "./extension/http-app.js";
import { createLogger } from "./extension/logger.js";
import { installGracefulShutdown } from "./extension/shutdown.js";
import type { ExtensionRegistry } from "./extension/types.js";
import {
	type AnyNodeServer,
	buildPublicUrl,
	createNodeServer,
	type ResolvedListen,
} from "./listen.js";

export type NextApp = {
	prepare: () => Promise<void>;
	getRequestHandler: () => (
		req: IncomingMessage,
		res: ServerResponse,
	) => Promise<void>;
	getUpgradeHandler: () => (
		req: IncomingMessage,
		socket: Duplex,
		head: Buffer,
	) => Promise<void>;
};

export type CreateNext = (options: {
	dev?: boolean;
	dir?: string;
	hostname?: string;
	port?: number;
	quiet?: boolean;
	httpServer?: AnyNodeServer;
	/** Force Turbopack (Next programmatic API). */
	turbopack?: boolean;
	/** Force webpack (Next programmatic API). */
	webpack?: boolean;
}) => NextApp;

export type BootServerOptions = {
	dir: string;
	dev: boolean;
	listen: ResolvedListen;
	registry: ExtensionRegistry;
	createNext: CreateNext;
	quiet?: boolean;
	/** Dev-only: pass through to `next({ turbopack })`. */
	turbopack?: boolean;
	/** Dev-only: pass through to `next({ webpack })`. */
	webpack?: boolean;
	keepAliveTimeout?: number;
	/** Override the post-listen console line. */
	readyLog?: (info: { url: string; dev: boolean; https: boolean }) => string;
};

/**
 * Shared Node + Next boot: create server, prepare Next, wire middleware onion,
 * listen, hooks, graceful shutdown. Used by `startCustomServer` (dev) and the
 * standalone CJS entry (prod).
 */
export async function bootServer(
	options: BootServerOptions,
): Promise<AnyNodeServer> {
	const {
		dir,
		dev,
		listen,
		registry,
		createNext,
		quiet,
		turbopack,
		webpack,
		keepAliveTimeout,
		readyLog,
	} = options;
	const { hostname, port, https: useHttps } = listen;
	const log = createLogger();
	const shutdownTimeoutMs = registry.config.shutdownTimeoutMs ?? 10_000;

	const server = createNodeServer(listen);
	if (keepAliveTimeout !== undefined) {
		server.keepAliveTimeout = keepAliveTimeout;
	}

	const nextApp = createNext({
		dev,
		dir,
		hostname,
		port,
		quiet,
		httpServer: server,
		...(turbopack ? { turbopack: true } : {}),
		...(webpack ? { webpack: true } : {}),
	});
	await nextApp.prepare();

	const nextHandler = nextApp.getRequestHandler();
	const upgradeHandler = nextApp.getUpgradeHandler();

	const httpApp = await createHttpApp({
		registry,
		config: {
			dir,
			hostname,
			port,
			https: useHttps,
			dev,
			shutdownTimeoutMs,
		},
		nextHandler: async (req, res) => {
			await nextHandler(req, res);
		},
		log,
	});

	await httpApp.hooks.emit("server:start", {
		runtime: httpApp.runtime,
		log,
	});

	server.on("request", (req, res) => {
		void httpApp.handle(req, res);
	});

	server.on("upgrade", (req, socket, head) => {
		void upgradeHandler(req, socket, head).catch((error: unknown) => {
			log.error("upgrade failed", {
				error: error instanceof Error ? error.message : String(error),
			});
			socket.destroy();
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, hostname, () => {
			server.off("error", reject);
			resolve();
		});
	});

	const url = buildPublicUrl({ hostname, port, https: useHttps });
	httpApp.setUrl(url);
	await httpApp.hooks.emit("server:ready", {
		runtime: httpApp.runtime,
		log,
	});
	installGracefulShutdown({
		server,
		hooks: httpApp.hooks,
		runtime: httpApp.runtime,
		log,
		timeoutMs: shutdownTimeoutMs,
	});

	const bundlerLabel = turbopack ? ", turbopack" : webpack ? ", webpack" : "";
	const message =
		readyLog?.({ url, dev, https: useHttps }) ??
		`> Ready on ${url} (${dev ? "development" : "production"}${bundlerLabel}${useHttps ? ", https" : ""})`;
	console.log(message);

	return server;
}
