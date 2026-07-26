#!/usr/bin/env node
/**
 * Stable bin entry for pnpm workspace installs.
 * `package.json#bin` must exist before `dist/` is built; this wrapper always does.
 */
import "../dist/cli.js";
