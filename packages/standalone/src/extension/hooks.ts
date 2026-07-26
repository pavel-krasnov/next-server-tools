import type { HookDefinition, HookHandlerMap, HookName } from "./types.js";

export class HookBus {
	#hooks = new Map<HookName, HookDefinition[]>();

	register(definition: HookDefinition): void {
		const list = this.#hooks.get(definition.name) ?? [];
		list.push(definition);
		list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
		this.#hooks.set(definition.name, list);
	}

	async emit<K extends HookName>(
		name: K,
		event: Parameters<HookHandlerMap[K]>[0],
	): Promise<void> {
		const list = this.#hooks.get(name) ?? [];
		for (const definition of list) {
			await (
				definition.handler as (
					event: Parameters<HookHandlerMap[K]>[0],
				) => void | Promise<void>
			)(event);
		}
	}
}
