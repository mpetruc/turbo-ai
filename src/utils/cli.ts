import * as fs from "node:fs";
import * as path from "node:path";

export interface CliOptions {
	cwd: string;
	help: boolean;
	error?: string;
}

export function parseCliArgs(args: string[], defaultCwd: string): CliOptions {
	let cwd = defaultCwd;
	let help = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		if (arg === "--help" || arg === "-h") {
			help = true;
			continue;
		}
		if (arg === "--dir") {
			const value = args[++index];
			if (!value) return { cwd, help, error: "--dir requires a directory path" };
			cwd = path.resolve(defaultCwd, value);
			continue;
		}
		return { cwd, help, error: `Unknown argument: ${arg}` };
	}
	if (!help) {
		try {
			if (!fs.statSync(cwd).isDirectory()) return { cwd, help, error: `Not a directory: ${cwd}` };
		} catch {
			return { cwd, help, error: `Directory does not exist or is not accessible: ${cwd}` };
		}
	}
	return { cwd, help };
}

export const CLI_USAGE = "Usage: turbo-ai [--dir <project-directory>]";
