import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { describe, it } from "node:test";
import { bootServer, type CreateNext } from "../../src/boot-server.js";
import type { ExtensionRegistry } from "../../src/extension/types.js";

function emptyRegistry(): ExtensionRegistry {
	return {
		config: {},
		middlewares: [],
		hooks: [],
		plugins: [],
	};
}

function fakeCreateNext(received: unknown[]): CreateNext {
	return (options) => {
		received.push(options);
		return {
			prepare: async () => {},
			getRequestHandler:
				() => async (_req: IncomingMessage, res: ServerResponse) => {
					res.statusCode = 200;
					res.end("ok");
				},
			getUpgradeHandler:
				() => async (_req: IncomingMessage, socket: Duplex) => {
					socket.destroy();
				},
		};
	};
}

describe("bootServer bundler options", () => {
	it("forwards turbopack to createNext", async () => {
		const received: unknown[] = [];
		const server = await bootServer({
			dir: process.cwd(),
			dev: true,
			listen: {
				hostname: "127.0.0.1",
				port: 0,
				https: false,
			},
			registry: emptyRegistry(),
			createNext: fakeCreateNext(received),
			turbopack: true,
			quiet: true,
			readyLog: () => "> test ready",
		});

		try {
			assert.equal(received.length, 1);
			assert.equal((received[0] as { turbopack?: boolean }).turbopack, true);
			assert.equal((received[0] as { webpack?: boolean }).webpack, undefined);
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		}
	});

	it("forwards webpack to createNext", async () => {
		const received: unknown[] = [];
		const server = await bootServer({
			dir: process.cwd(),
			dev: true,
			listen: {
				hostname: "127.0.0.1",
				port: 0,
				https: false,
			},
			registry: emptyRegistry(),
			createNext: fakeCreateNext(received),
			webpack: true,
			quiet: true,
			readyLog: () => "> test ready",
		});

		try {
			assert.equal((received[0] as { webpack?: boolean }).webpack, true);
			assert.equal(
				(received[0] as { turbopack?: boolean }).turbopack,
				undefined,
			);
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		}
	});
});
