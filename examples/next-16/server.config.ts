import {
	defineConfig,
	defineMiddleware,
} from "@next-server-tools/standalone";

export default defineConfig({
	shutdownTimeoutMs: 10_000,
	middlewares: [
		defineMiddleware(
			{ name: "demo-config", order: 12 },
			async (ctx, next) => {
				ctx.res.headers.set("x-demo-config", "1");
				await next();
			},
		),
	],
});
