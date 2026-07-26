import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { discoverExtensionPaths } from "./discovery.js";

// This file compiles to dist/extension/bundle-extensions.js → package root is ../..
const packageRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

function importPathLiteral(filePath: string): string {
	// Absolute POSIX-style path string for esbuild to resolve on disk.
	return JSON.stringify(filePath);
}

/**
 * Bundles discovered user extensions into a CJS module for the standalone server.
 */
export async function bundleProjectExtensions(options: {
	projectDir: string;
	outfile: string;
}): Promise<boolean> {
	const paths = await discoverExtensionPaths(options.projectDir);
	const hasAny =
		!!paths.configFile ||
		paths.middlewareFiles.length > 0 ||
		paths.hookFiles.length > 0 ||
		paths.pluginFiles.length > 0;

	await mkdir(path.dirname(options.outfile), { recursive: true });

	if (!hasAny) {
		await writeFile(
			options.outfile,
			`"use strict";\nmodule.exports = ${JSON.stringify({
				config: {},
				middlewares: [],
				hooks: [],
				plugins: [],
			})};\n`,
		);
		return false;
	}

	const lines: string[] = [];
	const middlewareIds: string[] = [];
	const hookIds: string[] = [];
	const pluginIds: string[] = [];

	if (paths.configFile) {
		lines.push(`import configMod from ${importPathLiteral(paths.configFile)};`);
	} else {
		lines.push(`const configMod = { default: {} };`);
	}

	paths.middlewareFiles.forEach((file, index) => {
		const id = `mw${index}`;
		middlewareIds.push(id);
		lines.push(`import ${id} from ${importPathLiteral(file)};`);
	});
	paths.hookFiles.forEach((file, index) => {
		const id = `hook${index}`;
		hookIds.push(id);
		lines.push(`import ${id} from ${importPathLiteral(file)};`);
	});
	paths.pluginFiles.forEach((file, index) => {
		const id = `plugin${index}`;
		pluginIds.push(id);
		lines.push(`import ${id} from ${importPathLiteral(file)};`);
	});

	lines.push(`const config = configMod?.default ?? configMod ?? {};`);
	lines.push(
		`const middlewares = [${middlewareIds.join(", ")}].map((m) => m?.default ?? m).filter(Boolean);`,
	);
	lines.push(
		`const hooks = [${hookIds.join(", ")}].map((h) => h?.default ?? h).filter(Boolean);`,
	);
	lines.push(
		`const plugins = [${pluginIds.join(", ")}].map((p) => p?.default ?? p).filter(Boolean);`,
	);
	lines.push(`export default { config, middlewares, hooks, plugins };`);

	const entry = path.join(
		path.dirname(options.outfile),
		"_extensions-entry.mjs",
	);
	await writeFile(entry, lines.join("\n"));

	try {
		await build({
			absWorkingDir: options.projectDir,
			entryPoints: [entry],
			outfile: options.outfile,
			bundle: true,
			platform: "node",
			format: "cjs",
			target: "node22",
			logLevel: "silent",
			// Resolve project baseUrl/paths (e.g. `utils/...`, `graphql/...`).
			tsconfig: path.join(options.projectDir, "tsconfig.json"),
			// Keep npm deps out of the extensions bundle; resolve at runtime
			// from the standalone app (or project) node_modules.
			packages: "external",
			// User files import from "@next-server-tools/standalone"; alias to define-only shim
			// so we don't pull the whole runtime (or break on import.meta) into the bundle.
			alias: {
				// Prefer compiled shim from dist (what consumers get on npm).
				"@next-server-tools/standalone": path.join(
					packageRoot,
					"dist/extension/shim.js",
				),
			},
		});
	} finally {
		await unlink(entry).catch(() => undefined);
	}

	return true;
}
