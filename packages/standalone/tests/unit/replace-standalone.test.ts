import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { replaceStandaloneServer } from "../../src/replace-standalone.js";

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

describe("replaceStandaloneServer copySsl", () => {
	it("copies ssl/ into the standalone app dir when copySsl is true", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ncs-copy-ssl-"));
		const appDir = path.join(dir, ".next/standalone");
		await mkdir(path.join(appDir, ".next"), { recursive: true });
		await writeFile(path.join(appDir, "server.js"), "// stock\n");
		await mkdir(path.join(dir, "ssl"), { recursive: true });
		await writeFile(path.join(dir, "ssl", "server.crt"), "CERT\n");
		await writeFile(path.join(dir, "ssl", "server.key"), "KEY\n");

		await replaceStandaloneServer({
			dir,
			copyStatic: false,
			copySsl: true,
		});

		assert.equal(
			await readFile(path.join(appDir, "ssl", "server.crt"), "utf8"),
			"CERT\n",
		);
		assert.equal(
			await readFile(path.join(appDir, "ssl", "server.key"), "utf8"),
			"KEY\n",
		);
	});

	it("does not copy ssl/ by default", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ncs-no-copy-ssl-"));
		const appDir = path.join(dir, ".next/standalone");
		await mkdir(path.join(appDir, ".next"), { recursive: true });
		await writeFile(path.join(appDir, "server.js"), "// stock\n");
		await mkdir(path.join(dir, "ssl"), { recursive: true });
		await writeFile(path.join(dir, "ssl", "server.crt"), "CERT\n");
		await writeFile(path.join(dir, "ssl", "server.key"), "KEY\n");

		await replaceStandaloneServer({ dir, copyStatic: false });

		assert.equal(await exists(path.join(appDir, "ssl")), false);
	});

	it("throws when copySsl is true but ssl/ is missing", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ncs-missing-ssl-"));
		const appDir = path.join(dir, ".next/standalone");
		await mkdir(path.join(appDir, ".next"), { recursive: true });
		await writeFile(path.join(appDir, "server.js"), "// stock\n");

		await assert.rejects(
			() => replaceStandaloneServer({ dir, copyStatic: false, copySsl: true }),
			/copySsl is enabled but .+\/ssl was not found/,
		);
	});
});
