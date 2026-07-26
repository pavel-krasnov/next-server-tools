import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { emptyRegistry, mergeRegistries } from "./registry.js";
import type {
	ExtensionRegistry,
	HookDefinition,
	MiddlewareDefinition,
	PluginDefinition,
	ServerUserConfig,
} from "./types.js";

const CONFIG_FILES = [
	"server.config.ts",
	"server.config.mts",
	"server.config.js",
	"server.config.mjs",
	"server.config.cjs",
];

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

function orderFromFilename(filePath: string): number {
	const base = path.basename(filePath);
	const match = /^(\d+)[-_]/.exec(base);
	const order = match?.[1];
	return order ? Number.parseInt(order, 10) : 100;
}

async function listModules(dir: string): Promise<string[]> {
	if (!(await exists(dir))) {
		return [];
	}
	const entries = await readdir(dir);
	const files: string[] = [];
	for (const entry of entries) {
		if (entry.startsWith(".")) {
			continue;
		}
		const full = path.join(dir, entry);
		const info = await stat(full);
		if (!info.isFile()) {
			continue;
		}
		if (!/\.(ts|mts|js|mjs|cjs)$/.test(entry)) {
			continue;
		}
		if (entry.endsWith(".d.ts")) {
			continue;
		}
		files.push(full);
	}
	return files.sort((a, b) => {
		const order = orderFromFilename(a) - orderFromFilename(b);
		return order !== 0 ? order : a.localeCompare(b);
	});
}

export async function findConfigFile(
	projectDir: string,
): Promise<string | undefined> {
	for (const name of CONFIG_FILES) {
		const full = path.join(projectDir, name);
		if (await exists(full)) {
			return full;
		}
	}
	return undefined;
}

export async function discoverExtensionPaths(projectDir: string): Promise<{
	configFile?: string;
	middlewareFiles: string[];
	hookFiles: string[];
	pluginFiles: string[];
}> {
	const serverDir = path.join(projectDir, "server");
	return {
		configFile: await findConfigFile(projectDir),
		middlewareFiles: await listModules(path.join(serverDir, "middleware")),
		hookFiles: await listModules(path.join(serverDir, "hooks")),
		pluginFiles: await listModules(path.join(serverDir, "plugins")),
	};
}

function asDefault<T>(mod: unknown): T | undefined {
	if (!mod || typeof mod !== "object") {
		return undefined;
	}
	const record = mod as { default?: T };
	return record.default;
}

function isMiddleware(value: unknown): value is MiddlewareDefinition {
	return (
		!!value &&
		typeof value === "object" &&
		"handler" in value &&
		typeof (value as MiddlewareDefinition).handler === "function" &&
		"name" in value
	);
}

function isHook(value: unknown): value is HookDefinition {
	return (
		!!value &&
		typeof value === "object" &&
		"handler" in value &&
		typeof (value as HookDefinition).handler === "function" &&
		"name" in value &&
		typeof (value as HookDefinition).name === "string" &&
		(value as HookDefinition).name.includes(":")
	);
}

function isPlugin(value: unknown): value is PluginDefinition {
	return (
		!!value &&
		typeof value === "object" &&
		"setup" in value &&
		typeof (value as PluginDefinition).setup === "function" &&
		"name" in value
	);
}

function isConfig(value: unknown): value is ServerUserConfig {
	return !!value && typeof value === "object";
}

export async function loadExtensionRegistry(
	projectDir: string,
	importModule: (filePath: string) => Promise<unknown>,
): Promise<ExtensionRegistry> {
	const paths = await discoverExtensionPaths(projectDir);
	const parts: ExtensionRegistry[] = [emptyRegistry()];

	if (paths.configFile) {
		const mod = await importModule(paths.configFile);
		const config = asDefault<ServerUserConfig>(mod) ?? mod;
		if (isConfig(config)) {
			parts.push({
				config,
				middlewares: [],
				hooks: [],
				plugins: [],
			});
		}
	}

	const middlewares: MiddlewareDefinition[] = [];
	for (const file of paths.middlewareFiles) {
		const mod = await importModule(file);
		const value = asDefault<MiddlewareDefinition>(mod) ?? mod;
		if (isMiddleware(value)) {
			middlewares.push({
				...value,
				order: value.order ?? orderFromFilename(file),
			});
		}
	}

	const hooks: HookDefinition[] = [];
	for (const file of paths.hookFiles) {
		const mod = await importModule(file);
		const value = asDefault<HookDefinition>(mod) ?? mod;
		if (isHook(value)) {
			hooks.push({
				...value,
				order: value.order ?? orderFromFilename(file),
			});
		}
	}

	const plugins: PluginDefinition[] = [];
	for (const file of paths.pluginFiles) {
		const mod = await importModule(file);
		const value = asDefault<PluginDefinition>(mod) ?? mod;
		if (isPlugin(value)) {
			plugins.push({
				...value,
				order: value.order ?? orderFromFilename(file),
			});
		}
	}

	parts.push({ config: {}, middlewares, hooks, plugins });
	return mergeRegistries(...parts);
}
