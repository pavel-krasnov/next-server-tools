import { createRequire } from "node:module";
import path from "node:path";
import { bootServer, type CreateNext } from "./boot-server.js";
import { loadProjectExtensions } from "./extension/load.js";
import { type AnyNodeServer, resolveListenOptions } from "./listen.js";
import type { CustomServerOptions } from "./types.js";

/**
 * Resolve the consumer's `next` from the project directory (not this package).
 * In a pnpm monorepo, resolving from the library would hoist the wrong Next major.
 */
function loadNext(projectDir: string): CreateNext {
	const requireFromProject = createRequire(
		path.join(projectDir, "package.json"),
	);
	return requireFromProject("next") as CreateNext;
}

function resolveOptions(options: CustomServerOptions = {}) {
	const dir = options.dir ?? process.cwd();
	const dev = options.dev ?? process.env.NODE_ENV !== "production";
	const listen = resolveListenOptions({
		dir,
		hostname: options.hostname,
		port: options.port,
		https: options.https,
		cert: options.cert,
		key: options.key,
	});

	const turbopack = options.turbopack === true;
	const webpack = options.webpack === true;
	if (turbopack && webpack) {
		throw new Error("Options turbopack and webpack are mutually exclusive");
	}

	return {
		dir,
		dev,
		quiet: options.quiet,
		listen,
		turbopack,
		webpack,
	};
}

/**
 * Starts the library-owned Node server (typically `nst dev`).
 * Supports plain HTTP or HTTPS when cert/key are provided.
 */
export async function startCustomServer(
	options: CustomServerOptions = {},
): Promise<AnyNodeServer> {
	const { dir, dev, quiet, listen, turbopack, webpack } =
		resolveOptions(options);
	const registry = await loadProjectExtensions(dir);

	return bootServer({
		dir,
		dev,
		listen,
		registry,
		createNext: loadNext(dir),
		quiet,
		turbopack: turbopack || undefined,
		webpack: webpack || undefined,
	});
}
