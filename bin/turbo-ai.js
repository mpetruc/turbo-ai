#!/usr/bin/env node
// Global launcher for turbo-ai. Registered via the "bin" field in package.json
// (npm link / npm install -g), so `turbo-ai` works from any working directory.
// The project directory is always the current working directory unless
// overridden with --dir (see src/utils/cli.ts).
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "..", "dist", "main.js");

if (!existsSync(entry)) {
	console.error("turbo-ai: compiled output missing (dist/main.js).");
	console.error("Run `npm run build` in the turbo-ai repository, then try again.");
	process.exit(1);
}

const { runCli } = await import(pathToFileURL(entry).href);
runCli();
