import type { TlsUserOptions } from "./listen.js";

export type CustomServerOptions = {
	/** Next.js project directory. Defaults to `process.cwd()`. */
	dir?: string;
	/** Run Next.js in development mode. Defaults from `NODE_ENV`. */
	dev?: boolean;
	/**
	 * Force Turbopack for the Next.js programmatic API (dev).
	 * Mutually exclusive with {@link webpack}. When neither is set, Next's
	 * version default applies (webpack on Next 15 custom server; Turbopack on Next 16+).
	 */
	turbopack?: boolean;
	/**
	 * Force webpack for the Next.js programmatic API (dev).
	 * Mutually exclusive with {@link turbopack}.
	 */
	webpack?: boolean;
	/** Hostname to bind. Defaults to `HOSTNAME`, `HOST`, or `localhost`. */
	hostname?: string;
	/** Port to bind. Defaults to `PORT` or `3000`. */
	port?: number;
	/** Hide Next.js server info errors. */
	quiet?: boolean;
} & TlsUserOptions;
