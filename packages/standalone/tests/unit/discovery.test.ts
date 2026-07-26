import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	discoverExtensionPaths,
	loadExtensionRegistry,
} from "../../src/extension/discovery.js";

async function writeProject(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "ncs-discovery-"));
	await writeFile(
		path.join(dir, "server.config.ts"),
		`export default { shutdownTimeoutMs: 1234 };\n`,
	);
	await mkdir(path.join(dir, "server/middleware"), { recursive: true });
	await mkdir(path.join(dir, "server/hooks"), { recursive: true });
	await mkdir(path.join(dir, "server/plugins"), { recursive: true });

	await writeFile(
		path.join(dir, "server/middleware/10-a.ts"),
		`export default { name: "a", order: 10, handler: async () => {} };\n`,
	);
	await writeFile(
		path.join(dir, "server/middleware/20-b.ts"),
		`export default { name: "b", order: 20, handler: async () => {} };\n`,
	);
	await writeFile(
		path.join(dir, "server/hooks/on-ready.ts"),
		`export default { name: "server:ready", order: 1, handler: async () => {} };\n`,
	);
	await writeFile(
		path.join(dir, "server/plugins/p.ts"),
		`export default { name: "p", order: 5, setup() {} };\n`,
	);
	await writeFile(
		path.join(dir, "server/middleware/.skip.ts"),
		`export default { name: "skip", handler: async () => {} };\n`,
	);

	return dir;
}

describe("discoverExtensionPaths", () => {
	it("finds config and extension modules, ignoring dotfiles", async () => {
		const dir = await writeProject();
		const paths = await discoverExtensionPaths(dir);
		assert.ok(paths.configFile?.endsWith("server.config.ts"));
		assert.equal(paths.middlewareFiles.length, 2);
		assert.ok(paths.middlewareFiles[0]?.endsWith("10-a.ts"));
		assert.ok(paths.middlewareFiles[1]?.endsWith("20-b.ts"));
		assert.equal(paths.hookFiles.length, 1);
		assert.equal(paths.pluginFiles.length, 1);
	});
});

describe("loadExtensionRegistry", () => {
	it("merges config and discovered modules", async () => {
		const dir = await writeProject();
		const modules = new Map<string, unknown>([
			[
				path.join(dir, "server.config.ts"),
				{ default: { shutdownTimeoutMs: 1234 } },
			],
			[
				path.join(dir, "server/middleware/10-a.ts"),
				{ default: { name: "a", order: 10, handler: async () => {} } },
			],
			[
				path.join(dir, "server/middleware/20-b.ts"),
				{ default: { name: "b", order: 20, handler: async () => {} } },
			],
			[
				path.join(dir, "server/hooks/on-ready.ts"),
				{
					default: {
						name: "server:ready",
						order: 1,
						handler: async () => {},
					},
				},
			],
			[
				path.join(dir, "server/plugins/p.ts"),
				{ default: { name: "p", order: 5, setup() {} } },
			],
		]);

		const registry = await loadExtensionRegistry(dir, async (filePath) => {
			const mod = modules.get(filePath);
			if (!mod) {
				throw new Error(`missing fixture module: ${filePath}`);
			}
			return mod;
		});

		assert.equal(registry.config.shutdownTimeoutMs, 1234);
		assert.equal(registry.middlewares.length, 2);
		assert.equal(registry.hooks.length, 1);
		assert.equal(registry.plugins.length, 1);
		assert.equal(registry.middlewares[0]?.name, "a");
	});
});
