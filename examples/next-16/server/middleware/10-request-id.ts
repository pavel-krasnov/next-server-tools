import { defineMiddleware } from "@next-server-tools/standalone";

export default defineMiddleware(
	{ name: "request-id", order: 10 },
	async (ctx, next) => {
		ctx.state.set("requestId", ctx.id);
		ctx.res.headers.set("x-request-id", ctx.id);
		await next();
	},
);
