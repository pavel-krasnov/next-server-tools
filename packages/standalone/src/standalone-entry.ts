/**
 * Bundled into dist/standalone-server.js (CJS) for Next standalone output.
 *
 * Thin adapter: inject standalone config, load bundled extensions, then
 * {@link bootServer} (same runtime path as `startCustomServer` / dev).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { bootServer, type CreateNext } from "./boot-server.js";
import { emptyRegistry, mergeRegistries } from "./extension/registry.js";
import type { ExtensionRegistry } from "./extension/types.js";
import { resolveListenOptions } from "./listen.js";

// Preserved by esbuild when emitting CJS. Typechecked via tsconfig.standalone.json.
declare const __filename: string;
declare const __dirname: string;

const require = createRequire(__filename);
const dir = __dirname;

process.chdir(dir);
process.env.NODE_ENV = "production";

function loadExtensions(): ExtensionRegistry {
	try {
		// Placed next to server.js by replace-standalone.
		const mod = require("./server-extensions.cjs") as
			| ExtensionRegistry
			| { default: ExtensionRegistry };
		const registry = "default" in mod && mod.default ? mod.default : mod;
		return mergeRegistries(emptyRegistry(), registry as ExtensionRegistry);
	} catch {
		return emptyRegistry();
	}
}

async function main(): Promise<void> {
	const distDir = process.env.NEXT_DIST_DIR ?? ".next";
	const { config: nextConfig } = require(
		path.join(dir, distDir, "required-server-files.json"),
	) as { config: Record<string, unknown> };

	// Required so Next loads the traced standalone config instead of looking
	// for next.config.* (often absent from the standalone tree).
	process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

	const listen = resolveListenOptions({ dir });
	const parsedKeepAlive = Number.parseInt(
		process.env.KEEP_ALIVE_TIMEOUT ?? "",
		10,
	);
	const keepAliveTimeout =
		Number.isFinite(parsedKeepAlive) && parsedKeepAlive >= 0
			? parsedKeepAlive
			: undefined;

	const createNext = require("next") as CreateNext;

	await bootServer({
		dir,
		dev: false,
		listen,
		registry: loadExtensions(),
		createNext,
		keepAliveTimeout,
		readyLog: ({ url }) => `> nst ready on ${url} (standalone)`,
	});
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
