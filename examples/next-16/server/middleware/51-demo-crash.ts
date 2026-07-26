import { defineMiddleware } from "@next-server-tools/standalone";

/** Throws without a matching error middleware — exercises `request:error`. */
export default defineMiddleware(
	{ name: "demo-crash", order: 51, match: "/demo/crash" },
	async () => {
		throw new Error("demo crash");
	},
);
