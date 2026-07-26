import path from "node:path";
import { createJiti } from "jiti";
import { loadExtensionRegistry } from "./discovery.js";
import type { ExtensionRegistry } from "./types.js";

export async function loadProjectExtensions(
	projectDir: string,
): Promise<ExtensionRegistry> {
	// Resolve from the project so npm deps and tsconfig baseUrl/paths work
	// for extension files that import app modules (e.g. `utils/...`).
	const jiti = createJiti(path.join(projectDir, "package.json"), {
		interopDefault: true,
		tsconfigPaths: path.join(projectDir, "tsconfig.json"),
	});

	return loadExtensionRegistry(projectDir, async (filePath) => {
		return jiti.import(filePath);
	});
}
