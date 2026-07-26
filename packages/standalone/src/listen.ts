import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import type { Duplex } from "node:stream";

export type TlsUserOptions = {
	/** Enable HTTPS. When omitted, uses env `HTTPS` (`1`/`true` or `0`/`false`). */
	https?: boolean;
	/** PEM certificate path or filename under `{dir}/ssl`. Env: `CERT`. */
	cert?: string;
	/** PEM private key path or filename under `{dir}/ssl`. Env: `KEY`. */
	key?: string;
};

export type ResolvedListen = {
	https: boolean;
	hostname: string;
	port: number;
	/** Absolute paths when HTTPS is enabled. */
	certPath?: string;
	keyPath?: string;
	httpsOptions?: https.ServerOptions;
};

export type CreateNodeServerOptions = {
	requestListener?: http.RequestListener;
};

function resolveSslPath(dir: string, value: string): string {
	if (path.isAbsolute(value)) {
		return value;
	}
	return path.resolve(dir, "ssl", value);
}

function parseEnvHttps(value: string | undefined): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === "1" || normalized === "true" || normalized === "yes") {
		return true;
	}
	if (
		normalized === "0" ||
		normalized === "false" ||
		normalized === "no" ||
		normalized === ""
	) {
		return false;
	}
	return undefined;
}

/**
 * Resolves bind host / port / TLS from options + environment.
 *
 * Env:
 * - `HOSTNAME` or `HOST` — bind host (default `localhost`)
 * - `PORT` — bind port (default `3000`)
 * - `HTTPS` — `1`/`true` enables HTTPS; `0`/`false` forces HTTP
 * - `CERT` — certificate filename/path when HTTPS is enabled (default `server.crt`)
 * - `KEY` — private key filename/path when HTTPS is enabled (default `server.key`)
 */
export function resolveListenOptions(options: {
	dir: string;
	hostname?: string;
	port?: number;
	https?: boolean;
	cert?: string;
	key?: string;
	env?: NodeJS.ProcessEnv;
}): ResolvedListen {
	const env = options.env ?? process.env;
	const hostname = options.hostname ?? env.HOSTNAME ?? env.HOST ?? "localhost";
	const port = options.port ?? Number.parseInt(env.PORT ?? "3000", 10);

	const envHttps = parseEnvHttps(env.HTTPS);
	const enableHttps =
		options.https === true ||
		(options.https === undefined && envHttps === true);

	if (!enableHttps) {
		return { https: false, hostname, port };
	}

	const certOpt =
		options.cert ??
		(typeof env.CERT === "string" && env.CERT.length > 0
			? env.CERT
			: undefined);
	const keyOpt =
		options.key ??
		(typeof env.KEY === "string" && env.KEY.length > 0 ? env.KEY : undefined);

	const certPath = resolveSslPath(options.dir, certOpt ?? "server.crt");
	const keyPath = resolveSslPath(options.dir, keyOpt ?? "server.key");

	if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
		throw new Error(
			`HTTPS enabled but cert/key not found.\n  cert: ${certPath}\n  key: ${keyPath}`,
		);
	}

	return {
		https: true,
		hostname,
		port,
		certPath,
		keyPath,
		httpsOptions: {
			cert: fs.readFileSync(certPath),
			key: fs.readFileSync(keyPath),
		},
	};
}

export type AnyNodeServer = http.Server | https.Server;

export function createNodeServer(
	listen: ResolvedListen,
	options: CreateNodeServerOptions = {},
): AnyNodeServer {
	if (listen.https) {
		if (!listen.httpsOptions) {
			throw new Error("HTTPS enabled but httpsOptions are missing");
		}
		return https.createServer(listen.httpsOptions, options.requestListener);
	}
	return http.createServer(options.requestListener);
}

export function buildPublicUrl(options: {
	hostname: string;
	port: number;
	https: boolean;
}): string {
	const protocol = options.https ? "https" : "http";
	const displayHost =
		!options.hostname ||
		options.hostname === "0.0.0.0" ||
		options.hostname === "::"
			? "localhost"
			: options.hostname.includes(":") && !options.hostname.startsWith("[")
				? `[${options.hostname}]`
				: options.hostname;

	const omitPort =
		(options.https && options.port === 443) ||
		(!options.https && options.port === 80);

	return omitPort
		? `${protocol}://${displayHost}`
		: `${protocol}://${displayHost}:${options.port}`;
}

export type UpgradeListener = (
	req: http.IncomingMessage,
	socket: Duplex,
	head: Buffer,
) => void;
