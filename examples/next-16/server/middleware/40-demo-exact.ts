import { defineMiddleware } from "@next-server-tools/standalone";

export default defineMiddleware(
	{ name: "demo-exact", order: 40, match: "/demo/exact" },
	async (ctx) => {
		ctx.res.status = 200;
		ctx.res.headers.set("content-type", "application/json; charset=utf-8");
		ctx.res.headers.set("x-demo-exact", "1");
		await ctx.res.end(JSON.stringify({ matched: "exact" }));
	},
);
