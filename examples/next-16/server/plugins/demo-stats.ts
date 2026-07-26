import { definePlugin } from "@next-server-tools/standalone";

export type DemoStats = {
	requestStart: number;
	requestFinish: number;
	requestError: number;
	nextBefore: number;
	nextAfter: number;
	responseSent: number;
	errorMiddleware: number;
};

export const DEMO_STATS_KEY = "demo.stats";
export const DEMO_SERVICE_KEY = "demo.service";

export default definePlugin({
	name: "demo-stats",
	order: 0,
	setup(api) {
		const stats: DemoStats = {
			requestStart: 0,
			requestFinish: 0,
			requestError: 0,
			nextBefore: 0,
			nextAfter: 0,
			responseSent: 0,
			errorMiddleware: 0,
		};

		api.provide(DEMO_STATS_KEY, stats);
		api.provide(DEMO_SERVICE_KEY, { name: "demo" });

		api.hook("request:start", () => {
			stats.requestStart += 1;
		});
		api.hook("request:finish", () => {
			stats.requestFinish += 1;
		});
		api.hook("request:error", () => {
			stats.requestError += 1;
		});
		api.hook("next:before", () => {
			stats.nextBefore += 1;
		});
		api.hook("next:after", () => {
			stats.nextAfter += 1;
		});
		api.hook("response:sent", () => {
			stats.responseSent += 1;
		});
	},
});
