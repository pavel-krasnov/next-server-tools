import type {
	Context,
	ErrorMiddlewareFn,
	MiddlewareDefinition,
	MiddlewareFn,
	NextFn,
} from "./types.js";

function matches(definition: MiddlewareDefinition, ctx: Context): boolean {
	if (!definition.match) {
		return true;
	}
	const path = ctx.req.url.pathname;
	if (typeof definition.match === "string") {
		if (definition.match.endsWith("/**")) {
			const prefix = definition.match.slice(0, -3);
			return path === prefix || path.startsWith(`${prefix}/`);
		}
		return path === definition.match;
	}
	return definition.match.test(path);
}

export function composeMiddleware(
	middlewares: MiddlewareDefinition[],
	final: (ctx: Context) => Promise<void>,
): (ctx: Context) => Promise<void> {
	const normal = middlewares
		.filter((item) => item.role !== "error")
		.slice()
		.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

	const errors = middlewares
		.filter((item) => item.role === "error")
		.slice()
		.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

	return async (ctx: Context) => {
		let index = -1;

		const dispatch = async (i: number): Promise<void> => {
			if (i <= index) {
				throw new Error("next() called multiple times");
			}
			index = i;
			const definition = normal[i];
			if (!definition) {
				await final(ctx);
				return;
			}
			if (!matches(definition, ctx)) {
				await dispatch(i + 1);
				return;
			}
			const next: NextFn = () => dispatch(i + 1);
			await (definition.handler as MiddlewareFn)(ctx, next);
		};

		try {
			await dispatch(0);
		} catch (error) {
			for (const definition of errors) {
				if (!matches(definition, ctx)) {
					continue;
				}
				let forwarded = false;
				const next: NextFn = async () => {
					forwarded = true;
				};
				await (definition.handler as ErrorMiddlewareFn)(ctx, next, error);
				if (!forwarded) {
					return;
				}
			}
			throw error;
		}
	};
}
