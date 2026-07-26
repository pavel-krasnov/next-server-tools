import { defineMiddleware } from "@next-server-tools/standalone";

export default defineMiddleware(
	{ name: "demo-regex", order: 42, match: /^\/demo\/re-.+/ },
	async (ctx) => {
		ctx.res.status = 200;
		ctx.res.headers.set("content-type", "application/json; charset=utf-8");
		ctx.res.headers.set("x-demo-regex", "1");
		await ctx.res.end(JSON.stringify({ matched: "regex" }));
	},
);
