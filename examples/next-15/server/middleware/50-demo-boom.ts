import { defineMiddleware } from "@next-server-tools/standalone";

export default defineMiddleware(
	{ name: "demo-boom", order: 50, match: "/demo/boom" },
	async () => {
		throw new Error("demo boom");
	},
);
