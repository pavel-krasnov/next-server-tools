import { defineMiddleware } from "@next-server-tools/standalone";
import { DEMO_STATS_KEY, type DemoStats } from "../plugins/demo-stats";

export default defineMiddleware(
	{ name: "demo-stats", order: 30, match: "/demo/stats" },
	async (ctx) => {
		const stats = ctx.runtime.get<DemoStats>(DEMO_STATS_KEY) ?? {
			requestStart: 0,
			requestFinish: 0,
			requestError: 0,
			nextBefore: 0,
			nextAfter: 0,
			responseSent: 0,
			errorMiddleware: 0,
		};
		ctx.res.status = 200;
		ctx.res.headers.set("content-type", "application/json; charset=utf-8");
		await ctx.res.end(JSON.stringify(stats));
	},
);
