import { type ChildProcess, spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findStandaloneServerEntries } from "../../src/replace-standalone.js";

const packageRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const repoRoot = path.resolve(packageRoot, "../..");
const cliPath = path.join(packageRoot, "dist/cli.js");

export type ExampleName = "next-15" | "next-16";
export type SmokeMode = "dev" | "start";

export type RunningServer = {
	baseUrl: string;
	exampleDir: string;
	markerDir: string;
	child: ChildProcess;
	stdout: string;
	stop: () => Promise<void>;
};

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

export function exampleDir(name: ExampleName): string {
	return path.join(repoRoot, "examples", name);
}

export async function getFreePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("failed to allocate port"));
				return;
			}
			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
				} else {
					resolve(port);
				}
			});
		});
		server.on("error", reject);
	});
}

async function waitForUrl(
	url: string,
	timeoutMs: number,
	options?: { shouldAbort?: () => Error | undefined },
): Promise<void> {
	const start = Date.now();
	let lastError: unknown;
	while (Date.now() - start < timeoutMs) {
		const aborted = options?.shouldAbort?.();
		if (aborted) {
			throw aborted;
		}
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
			lastError = new Error(`unexpected status ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(
		`Timed out waiting for ${url}: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
}

async function clearMarkers(markerDir: string): Promise<void> {
	await rm(markerDir, { recursive: true, force: true });
}

export async function buildExample(name: ExampleName): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(
			"pnpm",
			["--filter", `@examples/${name}`, "build"],
			{
				cwd: repoRoot,
				stdio: "inherit",
				env: process.env,
			},
		);
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`build failed for ${name} (code ${code})`));
			}
		});
	});
}

export async function startExampleServer(options: {
	name: ExampleName;
	mode: SmokeMode;
	port?: number;
	/** Extra CLI args for `nst dev` / unused for start. */
	devArgs?: string[];
}): Promise<RunningServer> {
	const dir = exampleDir(options.name);
	const port = options.port ?? (await getFreePort());
	const baseUrl = `http://127.0.0.1:${port}`;
	let markerDir = path.join(dir, ".demo-markers");
	let child: ChildProcess;
	let stdout = "";

	if (options.mode === "dev") {
		await clearMarkers(markerDir);
		child = spawn(
			process.execPath,
			[
				cliPath,
				"dev",
				"-H",
				"127.0.0.1",
				"-p",
				String(port),
				...(options.devArgs ?? []),
			],
			{
				cwd: dir,
				env: { ...process.env, NODE_ENV: "development" },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
	} else {
		const entries = await findStandaloneServerEntries(dir);
		const serverPath = entries[0];
		if (!serverPath) {
			throw new Error(`No standalone server.js for ${options.name}`);
		}
		markerDir = path.join(path.dirname(serverPath), ".demo-markers");
		await clearMarkers(markerDir);
		child = spawn(process.execPath, [serverPath], {
			cwd: path.dirname(serverPath),
			env: {
				...process.env,
				NODE_ENV: "production",
				HOSTNAME: "127.0.0.1",
				PORT: String(port),
				NEXT_DIST_DIR: ".next",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
	}

	const append = (chunk: Buffer) => {
		stdout += chunk.toString("utf8");
	};
	child.stdout?.on("data", append);
	child.stderr?.on("data", append);

	let exitError: Error | undefined;
	child.on("exit", (code, signal) => {
		if (signal === "SIGTERM" || code === 0) {
			return;
		}
		exitError = new Error(
			`server exited early (code=${code}, signal=${signal})\n${stdout}`,
		);
	});

	// Wait for a Next-handled route so readiness is not only extension short-circuit.
	const timeoutMs = options.mode === "dev" ? 120_000 : 60_000;
	try {
		await waitForUrl(`${baseUrl}/api/ok`, timeoutMs, {
			shouldAbort: () => exitError,
		});
	} catch (error) {
		child.kill("SIGKILL");
		throw new Error(
			`${error instanceof Error ? error.message : error}\n--- server output ---\n${stdout}`,
		);
	}

	return {
		baseUrl,
		exampleDir: dir,
		markerDir,
		child,
		get stdout() {
			return stdout;
		},
		async stop() {
			if (child.exitCode !== null || child.signalCode) {
				return;
			}
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => {
					child.kill("SIGKILL");
					reject(new Error(`server did not exit after SIGTERM\n${stdout}`));
				}, 15_000);
				child.once("exit", () => {
					clearTimeout(timer);
					resolve();
				});
				child.kill("SIGTERM");
			});
		},
	};
}

export async function markerExists(
	markerDir: string,
	name: "server-start" | "server-shutdown",
): Promise<boolean> {
	return exists(path.join(markerDir, name));
}
