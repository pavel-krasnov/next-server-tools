import { spawn } from "node:child_process";
import path from "node:path";
import { resolveListenOptions, type TlsUserOptions } from "./listen.js";
import { findStandaloneServerEntries } from "./replace-standalone.js";

export type StartStandaloneOptions = {
	dir?: string;
	/** Next.js build output directory (`distDir`), relative to `dir`. Defaults to `.next`. */
	distDir?: string;
	hostname?: string;
	port?: number;
} & TlsUserOptions;

function absolutizeSslEnv(projectDir: string, env: NodeJS.ProcessEnv): void {
	if (typeof env.CERT === "string" && env.CERT.length > 0) {
		env.CERT = path.isAbsolute(env.CERT)
			? env.CERT
			: path.resolve(projectDir, "ssl", env.CERT);
	}
	if (typeof env.KEY === "string" && env.KEY.length > 0) {
		env.KEY = path.isAbsolute(env.KEY)
			? env.KEY
			: path.resolve(projectDir, "ssl", env.KEY);
	}
}

/**
 * Runs the replaced standalone `server.js` (production entry for this package).
 */
export async function startStandaloneServer(
	options: StartStandaloneOptions = {},
): Promise<void> {
	const dir = options.dir ?? process.cwd();
	const distDir = options.distDir ?? ".next";
	const entries = await findStandaloneServerEntries(dir, distDir);

	if (entries.length === 0) {
		throw new Error(
			`No standalone server.js found under ${dir}/${distDir}/standalone. Run \`next build && nst replace-standalone\` first.`,
		);
	}

	if (entries.length > 1) {
		console.warn(
			`> Found ${entries.length} standalone servers; starting ${entries[0]}`,
		);
	}

	const serverPath = entries[0];
	if (serverPath === undefined) {
		throw new Error(
			`No standalone server.js found under ${dir}/${distDir}/standalone. Run \`next build && nst replace-standalone\` first.`,
		);
	}
	const env: NodeJS.ProcessEnv = {
		...process.env,
		NODE_ENV: "production",
		NEXT_DIST_DIR: distDir,
	};

	if (options.hostname !== undefined) {
		env.HOSTNAME = options.hostname;
	}
	if (options.port !== undefined) {
		env.PORT = String(options.port);
	}

	if (options.https === false) {
		env.HTTPS = "0";
	} else if (options.https === true) {
		// Resolve against the project root so standalone cwd does not break relative paths.
		const listen = resolveListenOptions({
			dir,
			https: true,
			cert: options.cert,
			key: options.key,
			env,
		});
		if (listen.https && listen.certPath && listen.keyPath) {
			env.HTTPS = "1";
			env.CERT = listen.certPath;
			env.KEY = listen.keyPath;
		}
	} else {
		absolutizeSslEnv(dir, env);
	}

	console.log(`> Starting standalone server: ${serverPath}`);

	const child = spawn(process.execPath, [serverPath], {
		stdio: "inherit",
		env,
		cwd: path.dirname(serverPath),
	});

	await new Promise<void>((resolve, reject) => {
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`Standalone server exited from signal ${signal}`));
				return;
			}
			if (code && code !== 0) {
				reject(new Error(`Standalone server exited with code ${code}`));
				return;
			}
			resolve();
		});
	});
}
