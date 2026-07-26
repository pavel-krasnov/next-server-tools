import { defineMiddleware } from "@next-server-tools/standalone";

export default defineMiddleware(
	{ name: "healthz", order: 20 },
	async (ctx, next) => {
		if (ctx.req.url.pathname === "/healthz") {
			ctx.res.status = 200;
			ctx.res.headers.set("content-type", "application/json; charset=utf-8");
			await ctx.res.end(JSON.stringify({ ok: true, id: ctx.id }));
			return;
		}
		await next();
	},
);
