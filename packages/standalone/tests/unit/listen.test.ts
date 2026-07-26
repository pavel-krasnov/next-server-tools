import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	buildPublicUrl,
	createNodeServer,
	resolveListenOptions,
} from "../../src/listen.js";

describe("resolveListenOptions", () => {
	it("defaults host and port", () => {
		const listen = resolveListenOptions({
			dir: "/tmp",
			env: {},
		});
		assert.equal(listen.https, false);
		assert.equal(listen.hostname, "localhost");
		assert.equal(listen.port, 3000);
	});

	it("prefers options over env", () => {
		const listen = resolveListenOptions({
			dir: "/tmp",
			hostname: "0.0.0.0",
			port: 4000,
			env: { HOSTNAME: "ignored", HOST: "ignored", PORT: "9999" },
		});
		assert.equal(listen.hostname, "0.0.0.0");
		assert.equal(listen.port, 4000);
	});

	it("reads HOSTNAME / HOST / PORT from env", () => {
		const listen = resolveListenOptions({
			dir: "/tmp",
			env: { HOST: "127.0.0.1", PORT: "8080" },
		});
		assert.equal(listen.hostname, "127.0.0.1");
		assert.equal(listen.port, 8080);
	});

	it("enables HTTPS from env and loads cert/key", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ncs-listen-"));
		const sslDir = path.join(dir, "ssl");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(sslDir, { recursive: true });
		await writeFile(path.join(sslDir, "server.crt"), "CERT");
		await writeFile(path.join(sslDir, "server.key"), "KEY");

		const listen = resolveListenOptions({
			dir,
			env: { HTTPS: "true" },
		});
		assert.equal(listen.https, true);
		assert.equal(listen.certPath, path.join(sslDir, "server.crt"));
		assert.equal(listen.keyPath, path.join(sslDir, "server.key"));
		assert.ok(listen.httpsOptions);
	});

	it("throws when HTTPS is enabled without cert files", () => {
		assert.throws(
			() =>
				resolveListenOptions({
					dir: "/tmp/does-not-exist-ncs",
					https: true,
					env: {},
				}),
			/cert\/key not found/,
		);
	});

	it("treats HTTPS=0 as disabled", () => {
		const listen = resolveListenOptions({
			dir: "/tmp",
			env: { HTTPS: "0" },
		});
		assert.equal(listen.https, false);
	});
});

describe("buildPublicUrl", () => {
	it("maps wildcard hosts to localhost", () => {
		assert.equal(
			buildPublicUrl({ hostname: "0.0.0.0", port: 3000, https: false }),
			"http://localhost:3000",
		);
		assert.equal(
			buildPublicUrl({ hostname: "::", port: 3000, https: false }),
			"http://localhost:3000",
		);
	});

	it("brackets IPv6 hosts", () => {
		assert.equal(
			buildPublicUrl({ hostname: "::1", port: 3000, https: false }),
			"http://[::1]:3000",
		);
	});

	it("omits default ports", () => {
		assert.equal(
			buildPublicUrl({ hostname: "localhost", port: 80, https: false }),
			"http://localhost",
		);
		assert.equal(
			buildPublicUrl({ hostname: "localhost", port: 443, https: true }),
			"https://localhost",
		);
	});
});

describe("createNodeServer", () => {
	it("creates an HTTP server", () => {
		const server = createNodeServer({
			https: false,
			hostname: "localhost",
			port: 3000,
		});
		assert.equal(typeof server.listen, "function");
		server.close();
	});
});
