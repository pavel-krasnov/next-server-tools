import type { IncomingMessage, ServerResponse } from "node:http";

export type HookName =
	| "server:start"
	| "server:ready"
	| "server:shutdown"
	| "request:start"
	| "request:finish"
	| "request:error"
	| "next:before"
	| "next:after"
	| "response:sent";

export type Logger = {
	info: (message: string, data?: Record<string, unknown>) => void;
	warn: (message: string, data?: Record<string, unknown>) => void;
	error: (message: string, data?: Record<string, unknown>) => void;
	debug: (message: string, data?: Record<string, unknown>) => void;
};

export type TimingMark = {
	end: () => void;
	readonly ms: number;
};

export type Timing = {
	mark: (name: string) => TimingMark;
};

export type TraceContext = {
	readonly traceId?: string;
	readonly spanId?: string;
};

export type RequestMeta = {
	readonly hitNext: boolean;
};

export type RequestPort = {
	readonly method: string;
	readonly url: URL;
	readonly headers: Headers;
	readonly raw: IncomingMessage;
	text: () => Promise<string>;
	arrayBuffer: () => Promise<ArrayBuffer>;
};

export type ResponsePort = {
	status: number;
	readonly headers: Headers;
	readonly writableEnded: boolean;
	readonly raw: ServerResponse;
	end: (body?: string | Buffer | Uint8Array) => Promise<void>;
};

export type StateBag<T extends object = Record<string, unknown>> = T & {
	set: <K extends string, V>(key: K, value: V) => void;
	get: <V = unknown>(key: string) => V | undefined;
};

export type RuntimeHandle = {
	readonly extensionApiVersion: 1;
	readonly url: string | undefined;
	readonly dir: string;
	readonly dev: boolean;
	get: <T = unknown>(key: string) => T | undefined;
};

export type RuntimeConfig = {
	readonly dir: string;
	readonly hostname: string;
	readonly port: number;
	readonly https: boolean;
	readonly dev: boolean;
	readonly shutdownTimeoutMs: number;
};

export type Context<TState extends object = Record<string, unknown>> = {
	readonly id: string;
	readonly req: RequestPort;
	readonly res: ResponsePort;
	readonly state: StateBag<TState>;
	readonly log: Logger;
	readonly config: Readonly<RuntimeConfig>;
	readonly runtime: RuntimeHandle;
	readonly timing: Timing;
	readonly trace: TraceContext;
	meta: RequestMeta;
};

export type NextFn = () => Promise<void>;

export type MiddlewareFn = (ctx: Context, next: NextFn) => void | Promise<void>;

export type ErrorMiddlewareFn = (
	ctx: Context,
	next: NextFn,
	error: unknown,
) => void | Promise<void>;

export type MiddlewareDefinition = {
	readonly name: string;
	readonly order: number;
	readonly match?: string | RegExp;
	readonly role?: "normal" | "error";
	readonly handler: MiddlewareFn | ErrorMiddlewareFn;
};

export type HookHandlerMap = {
	"server:start": (event: {
		runtime: RuntimeHandle;
		log: Logger;
	}) => void | Promise<void>;
	"server:ready": (event: {
		runtime: RuntimeHandle;
		log: Logger;
	}) => void | Promise<void>;
	"server:shutdown": (event: {
		runtime: RuntimeHandle;
		log: Logger;
	}) => void | Promise<void>;
	"request:start": (event: { ctx: Context }) => void | Promise<void>;
	"request:finish": (event: { ctx: Context }) => void | Promise<void>;
	"request:error": (event: {
		ctx: Context;
		error: unknown;
	}) => void | Promise<void>;
	"next:before": (event: { ctx: Context }) => void | Promise<void>;
	"next:after": (event: { ctx: Context }) => void | Promise<void>;
	"response:sent": (event: { ctx: Context }) => void | Promise<void>;
};

export type HookDefinition<K extends HookName = HookName> = {
	readonly name: K;
	readonly order: number;
	readonly handler: HookHandlerMap[K];
};

export type PluginMiddlewareInput =
	| {
			name: string;
			order?: number;
			match?: string | RegExp;
			role?: "normal";
			handler: MiddlewareFn;
	  }
	| {
			name: string;
			order?: number;
			match?: string | RegExp;
			role: "error";
			handler: ErrorMiddlewareFn;
	  };

export type PluginApi = {
	readonly config: Readonly<RuntimeConfig>;
	readonly runtime: RuntimeHandle;
	middleware: (definition: PluginMiddlewareInput) => void;
	hook: <K extends HookName>(
		name: K,
		handler: HookHandlerMap[K],
		options?: { order?: number },
	) => void;
	provide: (key: string, value: unknown) => void;
	get: <T = unknown>(key: string) => T | undefined;
};

export type PluginDefinition = {
	readonly name: string;
	readonly version?: string;
	readonly order: number;
	readonly peerExtensionApi?: string;
	readonly setup: (api: PluginApi) => void | Promise<void>;
};

export type ServerUserConfig = {
	readonly plugins?: PluginDefinition[];
	readonly middlewares?: MiddlewareDefinition[];
	readonly hooks?: HookDefinition[];
	readonly shutdownTimeoutMs?: number;
};

export type ExtensionRegistry = {
	readonly config: ServerUserConfig;
	readonly middlewares: MiddlewareDefinition[];
	readonly hooks: HookDefinition[];
	readonly plugins: PluginDefinition[];
};

export type NodeHandler = (
	req: IncomingMessage,
	res: ServerResponse,
) => Promise<void>;
