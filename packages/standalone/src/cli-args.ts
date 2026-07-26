import path from "node:path";

export type ParsedCliArgs =
	| { help: true }
	| {
			help: false;
			command: string | undefined;
			dir: string;
			hostname: string | undefined;
			port: number | undefined;
			https: boolean | undefined;
			cert: string | undefined;
			key: string | undefined;
			turbopack: boolean;
			webpack: boolean;
			distDir: string;
			copyStatic: boolean;
			copySsl: boolean;
	  };

export function printHelp(): void {
	console.log(`Usage: nst <command> [dir]

Commands:
  dev                 Start the custom server in development mode (replaces next dev)
  start               Start the replaced standalone server (replaces next start)
  replace-standalone  Replace {distDir}/standalone/server.js with the built custom server

Options:
  -H, --hostname      Hostname to bind (default: localhost / HOSTNAME / HOST)
  -p, --port          Port to bind (default: 3000 / PORT)
  --https             Enable HTTPS (uses ssl/server.crt + ssl/server.key by default)
  --cert <path>       TLS certificate path or filename under {dir}/ssl (env: CERT)
  --key <path>        TLS private key path or filename under {dir}/ssl (env: KEY)
  --turbopack         Force Turbopack for nst dev (pass turbopack: true to next())
  --webpack           Force webpack for nst dev (pass webpack: true to next())
  --dist-dir          Next.js build output directory (default: .next)
  --no-copy-static    Skip copying {distDir}/static and public (CDN / sidecar)
  --copy-ssl          Copy {dir}/ssl into standalone (replace-standalone; off by default)
  -h, --help          Show help
`);
}

export function parseArgs(argv: string[]): ParsedCliArgs {
	const args = [...argv];
	const command = args.shift();

	let hostname: string | undefined;
	let port: number | undefined;
	let https: boolean | undefined;
	let cert: string | undefined;
	let key: string | undefined;
	let turbopack = false;
	let webpack = false;
	let distDir = ".next";
	let copyStatic = true;
	let copySsl = false;
	let dir = process.cwd();

	while (args.length > 0) {
		const current = args.shift();
		if (current === undefined) {
			break;
		}
		if (current === "--help" || current === "-h") {
			return { help: true };
		}
		if (current === "--hostname" || current === "-H") {
			hostname = args.shift();
			continue;
		}
		if (current === "--port" || current === "-p") {
			port = Number.parseInt(args.shift() ?? "", 10);
			continue;
		}
		if (current === "--https") {
			https = true;
			continue;
		}
		if (current === "--cert") {
			const value = args.shift();
			if (!value) {
				throw new Error("Missing value for --cert");
			}
			cert = value;
			continue;
		}
		if (current === "--key") {
			const value = args.shift();
			if (!value) {
				throw new Error("Missing value for --key");
			}
			key = value;
			continue;
		}
		if (current === "--turbopack") {
			turbopack = true;
			continue;
		}
		if (current === "--webpack") {
			webpack = true;
			continue;
		}
		if (current === "--dist-dir") {
			const value = args.shift();
			if (!value) {
				throw new Error("Missing value for --dist-dir");
			}
			distDir = value;
			continue;
		}
		if (current === "--no-copy-static") {
			copyStatic = false;
			continue;
		}
		if (current === "--copy-ssl") {
			copySsl = true;
			continue;
		}
		if (!current.startsWith("-")) {
			dir = path.resolve(current);
			continue;
		}
		throw new Error(`Unknown option: ${current}`);
	}

	if (turbopack && webpack) {
		throw new Error("Options --turbopack and --webpack are mutually exclusive");
	}

	return {
		command,
		dir,
		hostname,
		port,
		https,
		cert,
		key,
		turbopack,
		webpack,
		distDir,
		copyStatic,
		copySsl,
		help: false,
	};
}
