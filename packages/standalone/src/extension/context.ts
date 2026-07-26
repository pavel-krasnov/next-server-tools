import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type {
	Context,
	Logger,
	RequestPort,
	ResponsePort,
	RuntimeConfig,
	RuntimeHandle,
	StateBag,
	Timing,
} from "./types.js";

function createStateBag(): StateBag {
	const bag: Record<string, unknown> = {};
	return new Proxy(bag as StateBag, {
		get(target, prop, receiver) {
			if (prop === "set") {
				return (key: string, value: unknown) => {
					target[key] = value;
				};
			}
			if (prop === "get") {
				return (key: string) => target[key];
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}

function createTiming(): Timing {
	return {
		mark(name: string) {
			const start = performance.now();
			let ms = 0;
			return {
				get ms() {
					return ms;
				},
				end() {
					ms = performance.now() - start;
					void name;
				},
			};
		},
	};
}

function nodeHeadersToWeb(req: IncomingMessage): Headers {
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) headers.append(key, item);
		} else {
			headers.set(key, value);
		}
	}
	return headers;
}

function applyWebHeaders(res: ServerResponse, headers: Headers): void {
	headers.forEach((value, key) => {
		res.setHeader(key, value);
	});
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function createRequestPort(req: IncomingMessage, origin: string): RequestPort {
	const host = req.headers.host ?? "localhost";
	const url = new URL(
		req.url ?? "/",
		origin.includes("://") ? origin : `http://${host}`,
	);
	let bodyPromise: Promise<Buffer> | undefined;

	const body = () => {
		bodyPromise ??= readBody(req);
		return bodyPromise;
	};

	return {
		method: req.method ?? "GET",
		url,
		headers: nodeHeadersToWeb(req),
		raw: req,
		async text() {
			return (await body()).toString("utf8");
		},
		async arrayBuffer() {
			const buffer = await body();
			return buffer.buffer.slice(
				buffer.byteOffset,
				buffer.byteOffset + buffer.byteLength,
			) as ArrayBuffer;
		},
	};
}

function createResponsePort(res: ServerResponse): ResponsePort {
	const headers = new Headers();
	let status = 200;
	let ended = false;

	return {
		get status() {
			return status;
		},
		set status(value: number) {
			status = value;
		},
		headers,
		get writableEnded() {
			return ended || res.writableEnded;
		},
		raw: res,
		async end(body) {
			if (ended || res.writableEnded) {
				return;
			}
			ended = true;
			applyWebHeaders(res, headers);
			res.statusCode = status;
			if (body === undefined) {
				res.end();
				return;
			}
			if (typeof body === "string" || Buffer.isBuffer(body)) {
				res.end(body);
				return;
			}
			Readable.from(Buffer.from(body)).pipe(res);
		},
	};
}

export function createContext(options: {
	req: IncomingMessage;
	res: ServerResponse;
	config: RuntimeConfig;
	runtime: RuntimeHandle;
	log: Logger;
	origin: string;
}): Context {
	return {
		id: randomUUID(),
		req: createRequestPort(options.req, options.origin),
		res: createResponsePort(options.res),
		state: createStateBag(),
		log: options.log,
		config: options.config,
		runtime: options.runtime,
		timing: createTiming(),
		trace: {},
		meta: { hitNext: false },
	};
}
