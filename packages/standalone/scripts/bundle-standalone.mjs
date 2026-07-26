import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
	entryPoints: [path.join(root, "src/standalone-entry.ts")],
	outfile: path.join(root, "dist/standalone-server.js"),
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node22",
	packages: "bundle",
	external: ["next", "next/*"],
	logLevel: "info",
});
