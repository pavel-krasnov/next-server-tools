import { access, copyFile, cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleProjectExtensions } from "./extension/bundle-extensions.js";

const packageRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

const DEFAULT_DIST_DIR = ".next";

/**
 * Locates Next standalone `server.js` files.
 * In monorepos the file is often nested (e.g. `.next/standalone/apps/web/server.js`).
 */
export async function findStandaloneServerEntries(
	projectDir: string = process.cwd(),
	distDir: string = DEFAULT_DIST_DIR,
): Promise<string[]> {
	const standaloneDir = path.join(projectDir, distDir, "standalone");
	if (!(await exists(standaloneDir))) {
		return [];
	}

	const results: string[] = [];

	async function walk(current: string): Promise<void> {
		const entries = await readdir(current);
		const serverPath = path.join(current, "server.js");
		const buildDir = path.join(current, distDir);

		if ((await exists(serverPath)) && (await exists(buildDir))) {
			results.push(serverPath);
		}

		for (const entry of entries) {
			if (entry === "node_modules" || entry === distDir) {
				continue;
			}
			const full = path.join(current, entry);
			const info = await stat(full);
			if (info.isDirectory()) {
				await walk(full);
			}
		}
	}

	await walk(standaloneDir);
	return results;
}

async function copyStaticAssets(
	projectDir: string,
	standaloneAppDir: string,
	distDir: string,
): Promise<void> {
	const staticSource = path.join(projectDir, distDir, "static");
	const staticTarget = path.join(standaloneAppDir, distDir, "static");
	if (await exists(staticSource)) {
		await mkdir(path.dirname(staticTarget), { recursive: true });
		await cp(staticSource, staticTarget, { recursive: true });
		console.log(`> Copied static assets: ${staticTarget}`);
	}

	const publicSource = path.join(projectDir, "public");
	const publicTarget = path.join(standaloneAppDir, "public");
	if (await exists(publicSource)) {
		await cp(publicSource, publicTarget, { recursive: true });
		console.log(`> Copied public assets: ${publicTarget}`);
	}
}

async function copySslAssets(
	projectDir: string,
	standaloneAppDir: string,
): Promise<void> {
	const sslSource = path.join(projectDir, "ssl");
	const sslTarget = path.join(standaloneAppDir, "ssl");
	if (!(await exists(sslSource))) {
		throw new Error(
			`copySsl is enabled but ${sslSource} was not found. Place cert/key files under {dir}/ssl (defaults: server.crt, server.key), or omit copySsl when TLS is provided elsewhere.`,
		);
	}
	await cp(sslSource, sslTarget, { recursive: true });
	console.log(`> Copied TLS assets: ${sslTarget}`);
}

export type ReplaceStandaloneOptions = {
	/** Project directory. Defaults to `process.cwd()`. */
	dir?: string;
	/**
	 * Next.js build output directory (`distDir`), relative to `dir`.
	 * Defaults to `.next`.
	 */
	distDir?: string;
	/**
	 * Copy `{distDir}/static` and `public` into the standalone output.
	 * Set to `false` when serving assets from a CDN or reverse-proxy sidecar.
	 * Defaults to `true`.
	 */
	copyStatic?: boolean;
	/**
	 * Copy `{dir}/ssl` into the standalone app directory so HTTPS certs are
	 * discoverable when the process cwd is the standalone tree (e.g. Docker).
	 * Defaults to `false` — leave off when TLS is terminated elsewhere or
	 * certs are mounted at runtime.
	 */
	copySsl?: boolean;
};

function resolveReplaceOptions(
	dirOrOptions: string | ReplaceStandaloneOptions = {},
): Required<
	Pick<ReplaceStandaloneOptions, "dir" | "distDir" | "copyStatic" | "copySsl">
> {
	if (typeof dirOrOptions === "string") {
		return {
			dir: dirOrOptions,
			distDir: DEFAULT_DIST_DIR,
			copyStatic: true,
			copySsl: false,
		};
	}
	return {
		dir: dirOrOptions.dir ?? process.cwd(),
		distDir: dirOrOptions.distDir ?? DEFAULT_DIST_DIR,
		copyStatic: dirOrOptions.copyStatic ?? true,
		copySsl: dirOrOptions.copySsl ?? false,
	};
}

/**
 * Replaces Next.js standalone `server.js` with this package's server and
 * bundles user extensions beside it.
 */
export async function replaceStandaloneServer(
	dirOrOptions: string | ReplaceStandaloneOptions = {},
): Promise<string[]> {
	const {
		dir: projectDir,
		distDir,
		copyStatic,
		copySsl,
	} = resolveReplaceOptions(dirOrOptions);
	const standaloneDir = path.join(projectDir, distDir, "standalone");
	const source = path.join(packageRoot, "dist", "standalone-server.js");

	if (!(await exists(source))) {
		throw new Error(
			`Built server not found at ${source}. Run \`pnpm build\` in @next-server-tools/standalone first.`,
		);
	}

	if (!(await exists(standaloneDir))) {
		throw new Error(
			`Standalone output not found at ${standaloneDir}. Ensure next.config has \`output: 'standalone'\` and run \`next build\` first.`,
		);
	}

	const targets = await findStandaloneServerEntries(projectDir, distDir);

	if (targets.length === 0) {
		throw new Error(`No standalone server.js found under ${standaloneDir}.`);
	}

	for (const target of targets) {
		const appDir = path.dirname(target);
		await copyFile(source, target);
		console.log(`> Replaced standalone server: ${target}`);

		const extensionsOut = path.join(appDir, "server-extensions.cjs");
		const bundled = await bundleProjectExtensions({
			projectDir,
			outfile: extensionsOut,
		});
		console.log(
			bundled
				? `> Bundled extensions: ${extensionsOut}`
				: `> Wrote empty extensions registry: ${extensionsOut}`,
		);

		if (copyStatic) {
			await copyStaticAssets(projectDir, appDir, distDir);
		} else {
			console.log("> Skipped copying static assets (copyStatic: false)");
		}

		if (copySsl) {
			await copySslAssets(projectDir, appDir);
		}
	}

	return targets;
}
