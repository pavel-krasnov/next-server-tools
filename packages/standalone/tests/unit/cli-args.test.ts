import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { parseArgs } from "../../src/cli-args.js";

describe("parseArgs", () => {
	it("parses command, host, port, and dir", () => {
		const parsed = parseArgs(["dev", "-H", "127.0.0.1", "-p", "4000", "./app"]);
		assert.equal(parsed.help, false);
		if (parsed.help) {
			return;
		}
		assert.equal(parsed.command, "dev");
		assert.equal(parsed.hostname, "127.0.0.1");
		assert.equal(parsed.port, 4000);
		assert.equal(parsed.dir, path.resolve("./app"));
		assert.equal(parsed.distDir, ".next");
		assert.equal(parsed.copyStatic, true);
		assert.equal(parsed.copySsl, false);
	});

	it("parses --https, --cert, --key, --dist-dir, --no-copy-static, --copy-ssl", () => {
		const parsed = parseArgs([
			"replace-standalone",
			"--https",
			"--cert",
			"my.crt",
			"--key",
			"my.key",
			"--dist-dir",
			"build",
			"--no-copy-static",
			"--copy-ssl",
		]);
		assert.equal(parsed.help, false);
		if (parsed.help) {
			return;
		}
		assert.equal(parsed.https, true);
		assert.equal(parsed.cert, "my.crt");
		assert.equal(parsed.key, "my.key");
		assert.equal(parsed.distDir, "build");
		assert.equal(parsed.copyStatic, false);
		assert.equal(parsed.copySsl, true);
	});

	it("returns help for -h", () => {
		assert.deepEqual(parseArgs(["dev", "-h"]), { help: true });
	});

	it("parses --turbopack and --webpack", () => {
		const withTurbo = parseArgs(["dev", "--turbopack"]);
		assert.equal(withTurbo.help, false);
		if (!withTurbo.help) {
			assert.equal(withTurbo.turbopack, true);
			assert.equal(withTurbo.webpack, false);
		}

		const withWebpack = parseArgs(["dev", "--webpack"]);
		assert.equal(withWebpack.help, false);
		if (!withWebpack.help) {
			assert.equal(withWebpack.turbopack, false);
			assert.equal(withWebpack.webpack, true);
		}
	});

	it("throws when --cert is missing a value", () => {
		assert.throws(
			() => parseArgs(["dev", "--cert"]),
			/Missing value for --cert/,
		);
	});

	it("throws when --turbopack and --webpack are both set", () => {
		assert.throws(
			() => parseArgs(["dev", "--turbopack", "--webpack"]),
			/mutually exclusive/,
		);
	});

	it("throws on unknown options", () => {
		assert.throws(() => parseArgs(["dev", "--nope"]), /Unknown option/);
	});
});
