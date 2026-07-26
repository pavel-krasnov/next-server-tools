import { definePlugin } from "@next-server-tools/standalone";

export default definePlugin({
	name: "logger",
	order: 0,
	setup(api) {
		api.middleware({
			name: "logger/request",
			order: 5,
			handler: async (ctx, next) => {
				const mark = ctx.timing.mark("request");
				try {
					await next();
				} finally {
					mark.end();
					ctx.log.info("request", {
						id: ctx.id,
						method: ctx.req.method,
						path: ctx.req.url.pathname,
						status: ctx.res.raw.statusCode,
						ms: Math.round(mark.ms),
					});
				}
			},
		});
	},
});
