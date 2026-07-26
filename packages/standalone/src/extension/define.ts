import type {
	ErrorMiddlewareFn,
	HookDefinition,
	HookHandlerMap,
	HookName,
	MiddlewareDefinition,
	MiddlewareFn,
	PluginDefinition,
	ServerUserConfig,
} from "./types.js";

type MiddlewareOptions = {
	name?: string;
	order?: number;
	match?: string | RegExp;
	role?: "normal" | "error";
};

let anonymousMiddleware = 0;
let anonymousPlugin = 0;

export function defineMiddleware(handler: MiddlewareFn): MiddlewareDefinition;
export function defineMiddleware(
	options: MiddlewareOptions,
	handler: MiddlewareFn,
): MiddlewareDefinition;
export function defineMiddleware(
	optionsOrHandler: MiddlewareOptions | MiddlewareFn,
	maybeHandler?: MiddlewareFn,
): MiddlewareDefinition {
	if (typeof optionsOrHandler === "function") {
		anonymousMiddleware += 1;
		return {
			name: `middleware:${anonymousMiddleware}`,
			order: 100,
			role: "normal",
			handler: optionsOrHandler,
		};
	}

	if (!maybeHandler) {
		throw new Error("defineMiddleware requires a handler");
	}

	return {
		name: optionsOrHandler.name ?? `middleware:${++anonymousMiddleware}`,
		order: optionsOrHandler.order ?? 100,
		match: optionsOrHandler.match,
		role: optionsOrHandler.role ?? "normal",
		handler: maybeHandler,
	};
}

export function defineErrorMiddleware(
	options: MiddlewareOptions,
	handler: ErrorMiddlewareFn,
): MiddlewareDefinition {
	return {
		name: options.name ?? `error-middleware:${++anonymousMiddleware}`,
		order: options.order ?? 10_000,
		match: options.match,
		role: "error",
		handler,
	};
}

export function defineHook<K extends HookName>(
	name: K,
	handler: HookHandlerMap[K],
	options?: { order?: number },
): HookDefinition<K> {
	return {
		name,
		order: options?.order ?? 100,
		handler,
	};
}

export function definePlugin(
	definition: Omit<PluginDefinition, "order"> & { order?: number },
): PluginDefinition {
	return {
		name: definition.name ?? `plugin:${++anonymousPlugin}`,
		version: definition.version,
		order: definition.order ?? 100,
		peerExtensionApi: definition.peerExtensionApi,
		setup: definition.setup,
	};
}

export function defineConfig(config: ServerUserConfig): ServerUserConfig {
	return config;
}
