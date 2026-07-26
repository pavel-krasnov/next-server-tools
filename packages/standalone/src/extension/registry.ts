import { HookBus } from "./hooks.js";
import type {
	ExtensionRegistry,
	HookDefinition,
	MiddlewareDefinition,
	PluginApi,
	PluginDefinition,
	RuntimeConfig,
	RuntimeHandle,
	ServerUserConfig,
} from "./types.js";

export type PreparedExtensions = {
	middlewares: MiddlewareDefinition[];
	hooks: HookBus;
	services: Map<string, unknown>;
	config: ServerUserConfig;
};

export async function prepareExtensions(
	registry: ExtensionRegistry,
	options: {
		config: RuntimeConfig;
		runtime: RuntimeHandle;
		services?: Map<string, unknown>;
	},
): Promise<PreparedExtensions> {
	const services = options.services ?? new Map<string, unknown>();
	const middlewares = [...registry.middlewares];
	const hooks = new HookBus();

	for (const hook of registry.hooks) {
		hooks.register(hook);
	}

	const plugins = [...registry.plugins].sort(
		(a, b) => a.order - b.order || a.name.localeCompare(b.name),
	);

	for (const plugin of plugins) {
		const api: PluginApi = {
			config: options.config,
			runtime: {
				...options.runtime,
				get: <T = unknown>(key: string) => services.get(key) as T | undefined,
			},
			middleware(definition) {
				middlewares.push({
					name: definition.name,
					order: definition.order ?? 100,
					match: definition.match,
					role: definition.role,
					handler: definition.handler,
				});
			},
			hook(name, handler, hookOptions) {
				hooks.register({
					name,
					order: hookOptions?.order ?? 100,
					handler,
				} as HookDefinition);
			},
			provide(key, value) {
				services.set(key, value);
			},
			get: <T = unknown>(key: string) => services.get(key) as T | undefined,
		};

		await plugin.setup(api);
	}

	return {
		middlewares,
		hooks,
		services,
		config: registry.config,
	};
}

export function emptyRegistry(): ExtensionRegistry {
	return {
		config: {},
		middlewares: [],
		hooks: [],
		plugins: [],
	};
}

export function mergeRegistries(
	...parts: ExtensionRegistry[]
): ExtensionRegistry {
	const config: ServerUserConfig = {};
	const middlewares: MiddlewareDefinition[] = [];
	const hooks: HookDefinition[] = [];
	const plugins: PluginDefinition[] = [];

	for (const part of parts) {
		Object.assign(config, part.config);
		middlewares.push(...part.middlewares);
		hooks.push(...part.hooks);
		plugins.push(...part.plugins);
	}

	if (config.middlewares) {
		middlewares.push(...config.middlewares);
	}
	if (config.hooks) {
		hooks.push(...config.hooks);
	}
	if (config.plugins) {
		plugins.push(...config.plugins);
	}

	return { config, middlewares, hooks, plugins };
}
