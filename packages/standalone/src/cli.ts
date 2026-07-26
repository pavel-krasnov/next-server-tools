#!/usr/bin/env node
import { parseArgs, printHelp } from "./cli-args.js";
import { replaceStandaloneServer } from "./replace-standalone.js";
import { startCustomServer } from "./server.js";
import { startStandaloneServer } from "./start-standalone.js";

async function main(): Promise<void> {
	const parsed = parseArgs(process.argv.slice(2));

	if (parsed.help || !parsed.command) {
		printHelp();
		process.exit(parsed.help ? 0 : 1);
	}

	const {
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
	} = parsed;

	switch (command) {
		case "dev": {
			process.env.NODE_ENV = "development";
			await startCustomServer({
				dir,
				dev: true,
				hostname,
				port,
				https,
				cert,
				key,
				turbopack: turbopack || undefined,
				webpack: webpack || undefined,
			});
			break;
		}
		case "start": {
			await startStandaloneServer({
				dir,
				distDir,
				hostname,
				port,
				https,
				cert,
				key,
			});
			break;
		}
		case "replace-standalone": {
			await replaceStandaloneServer({ dir, distDir, copyStatic, copySsl });
			break;
		}
		default: {
			console.error(`Unknown command: ${command}`);
			printHelp();
			process.exit(1);
		}
	}
}

try {
	await main();
} catch (error: unknown) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
