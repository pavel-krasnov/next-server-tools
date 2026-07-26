import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineHook } from "@next-server-tools/standalone";

export default defineHook("server:start", async ({ runtime, log }) => {
	const dir = path.join(runtime.dir, ".demo-markers");
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, "server-start"), `${Date.now()}\n`, "utf8");
	log.info("demo marker written", { marker: "server-start" });
});
