import { defineMiddleware } from "@next-server-tools/standalone";

export default defineMiddleware(
	{ name: "demo-prefix", order: 41, match: "/demo/prefix/**" },
	async (ctx) => {
		ctx.res.status = 200;
		ctx.res.headers.set("content-type", "application/json; charset=utf-8");
		ctx.res.headers.set("x-demo-prefix", "1");
		await ctx.res.end(JSON.stringify({ matched: "prefix" }));
	},
);
