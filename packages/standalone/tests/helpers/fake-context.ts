import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context, Logger } from "../../src/extension/types.js";

const noopLog: Logger = {
	info() {},
	warn() {},
	error() {},
	debug() {},
};

export function createFakeContext(
	pathname: string,
	overrides: Partial<Context> = {},
): Context {
	const headers = new Headers();
	let status = 200;
	let ended = false;
	let body: string | undefined;

	const res = {
		get status() {
			return status;
		},
		set status(value: number) {
			status = value;
		},
		headers,
		get writableEnded() {
			return ended;
		},
		raw: { statusCode: status } as ServerResponse,
		async end(value?: string | Buffer | Uint8Array) {
			ended = true;
			if (typeof value === "string") {
				body = value;
			}
		},
		get body() {
			return body;
		},
	};

	const ctx: Context = {
		id: "test-id",
		req: {
			method: "GET",
			url: new URL(pathname, "http://localhost:3000"),
			headers: new Headers(),
			raw: {} as IncomingMessage,
			async text() {
				return "";
			},
			async arrayBuffer() {
				return new ArrayBuffer(0);
			},
		},
		res,
		state: Object.assign(Object.create(null), {
			set(key: string, value: unknown) {
				(this as Record<string, unknown>)[key] = value;
			},
			get(key: string) {
				return (this as Record<string, unknown>)[key];
			},
		}),
		log: noopLog,
		config: {
			dir: "/tmp",
			hostname: "localhost",
			port: 3000,
			https: false,
			dev: true,
			shutdownTimeoutMs: 10_000,
		},
		runtime: {
			extensionApiVersion: 1,
			url: "http://localhost:3000",
			dir: "/tmp",
			dev: true,
			get() {
				return undefined;
			},
		},
		timing: {
			mark() {
				return { ms: 0, end() {} };
			},
		},
		trace: {},
		meta: { hitNext: false },
		...overrides,
	};

	return ctx;
}
