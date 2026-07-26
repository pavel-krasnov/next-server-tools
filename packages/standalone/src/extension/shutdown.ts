import type { Server } from "node:net";
import type { HookBus } from "./hooks.js";
import type { Logger, RuntimeHandle } from "./types.js";

export function installGracefulShutdown(options: {
	server: Server;
	hooks: HookBus;
	runtime: RuntimeHandle;
	log: Logger;
	timeoutMs: number;
}): void {
	let shuttingDown = false;

	const shutdown = async (signal: string) => {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		options.log.info("shutdown started", { signal });

		await new Promise<void>((resolve) => {
			options.server.close(() => resolve());
			setTimeout(resolve, options.timeoutMs).unref();
		});

		try {
			await options.hooks.emit("server:shutdown", {
				runtime: options.runtime,
				log: options.log,
			});
		} catch (error) {
			options.log.error("shutdown hook failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		process.exit(0);
	};

	process.once("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
	process.once("SIGINT", () => {
		void shutdown("SIGINT");
	});
}
