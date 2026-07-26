/**
 * Minimal surface bundled into standalone server-extensions.cjs
 * so user files can `import { defineMiddleware } from "@next-server-tools/standalone"`.
 */
export {
	defineConfig,
	defineErrorMiddleware,
	defineHook,
	defineMiddleware,
	definePlugin,
} from "./define.js";
