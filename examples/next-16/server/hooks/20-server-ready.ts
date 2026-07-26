import { defineHook } from "@next-server-tools/standalone";

export default defineHook("server:ready", async ({ log, runtime }) => {
	log.info("server ready", {
		url: runtime.url,
		api: runtime.extensionApiVersion,
	});
});
