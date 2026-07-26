import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { findStandaloneServerEntries } from "../../src/replace-standalone.js";

describe("findStandaloneServerEntries", () => {
	it("returns empty when standalone is missing", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ncs-standalone-"));
		assert.deepEqual(await findStandaloneServerEntries(dir), []);
	});

	it("finds nested monorepo server.js and skips node_modules", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ncs-standalone-"));
		const nested = path.join(dir, ".next/standalone/apps/web");
		const nestedNm = path.join(dir, ".next/standalone/node_modules/pkg");
		await mkdir(path.join(nested, ".next"), { recursive: true });
		await mkdir(path.join(nestedNm, ".next"), { recursive: true });
		await writeFile(path.join(nested, "server.js"), "// app\n");
		await writeFile(path.join(nestedNm, "server.js"), "// skip\n");

		const entries = await findStandaloneServerEntries(dir);
		assert.deepEqual(entries, [path.join(nested, "server.js")]);
	});

	it("respects custom distDir", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ncs-standalone-"));
		const appDir = path.join(dir, "build/standalone");
		await mkdir(path.join(appDir, "build"), { recursive: true });
		await writeFile(path.join(appDir, "server.js"), "// app\n");

		const entries = await findStandaloneServerEntries(dir, "build");
		assert.deepEqual(entries, [path.join(appDir, "server.js")]);
	});
});
