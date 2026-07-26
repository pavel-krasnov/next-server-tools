import { defineMiddleware } from "@next-server-tools/standalone";
import { DEMO_SERVICE_KEY } from "../plugins/demo-stats";

export default defineMiddleware(
	{ name: "demo-service", order: 15 },
	async (ctx, next) => {
		const service = ctx.runtime.get<{ name: string }>(DEMO_SERVICE_KEY);
		if (service?.name) {
			ctx.res.headers.set("x-demo-service", service.name);
		}
		await next();
	},
);
