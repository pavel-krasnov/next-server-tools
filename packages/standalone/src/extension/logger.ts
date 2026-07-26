import type { Logger } from "./types.js";

export function createLogger(prefix = "nst"): Logger {
	const format = (
		level: string,
		message: string,
		data?: Record<string, unknown>,
	) => {
		const payload = data ? ` ${JSON.stringify(data)}` : "";
		return `[${prefix}] ${level} ${message}${payload}`;
	};

	return {
		debug: (message, data) => {
			if (process.env.DEBUG) {
				console.debug(format("debug", message, data));
			}
		},
		info: (message, data) => console.info(format("info", message, data)),
		warn: (message, data) => console.warn(format("warn", message, data)),
		error: (message, data) => console.error(format("error", message, data)),
	};
}
