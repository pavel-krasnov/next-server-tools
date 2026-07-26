import { defineErrorMiddleware } from "@next-server-tools/standalone";
import { DEMO_STATS_KEY, type DemoStats } from "../plugins/demo-stats";

export default defineErrorMiddleware(
	{ name: "demo-error", order: 90, match: "/demo/boom" },
	async (ctx, _next, error) => {
		const stats = ctx.runtime.get<DemoStats>(DEMO_STATS_KEY);
		if (stats) {
			stats.errorMiddleware += 1;
		}

		ctx.res.status = 418;
		ctx.res.headers.set("content-type", "application/json; charset=utf-8");
		await ctx.res.end(
			JSON.stringify({
				ok: false,
				handled: true,
				message: error instanceof Error ? error.message : String(error),
			}),
		);
	},
);
