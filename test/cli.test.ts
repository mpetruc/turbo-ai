import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseCliArgs } from "../src/utils/cli.js";

const execFileAsync = promisify(execFile);
const BIN_PATH = fileURLToPath(new URL("../bin/turbo-ai.js", import.meta.url));
const DIST_ENTRY = fileURLToPath(new URL("../dist/main.js", import.meta.url));

test("parseCliArgs validates --dir and help", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-cli-"));
	try {
		assert.equal(parseCliArgs(["--dir", tmpDir], process.cwd()).cwd, path.resolve(tmpDir));
		assert.equal(parseCliArgs(["--help"], process.cwd()).help, true);
		assert.match(parseCliArgs(["--dir"], process.cwd()).error ?? "", /requires/);
		assert.match(parseCliArgs(["--dir", path.join(tmpDir, "missing")], process.cwd()).error ?? "", /does not exist/);
		assert.match(parseCliArgs(["--unknown"], process.cwd()).error ?? "", /Unknown argument/);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("turbo-ai bin launcher prints usage from a working directory containing spaces", async (t) => {
	if (!fs.existsSync(DIST_ENTRY)) {
		t.skip("dist/main.js not built yet; run `npm run build` first");
		return;
	}
	const spacedDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo ai spaced dir "));
	try {
		// Mirrors how npm's Windows .cmd shim invokes the bin: node <bin> <args>.
		const { stdout } = await execFileAsync(process.execPath, [BIN_PATH, "--help"], { cwd: spacedDir, timeout: 15000 });
		assert.match(stdout, /Usage: turbo-ai/);
	} finally {
		fs.rmSync(spacedDir, { recursive: true, force: true });
	}
});

test("turbo-ai bin launcher reports a missing build instead of crashing", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-bin-"));
	try {
		// A copy outside the package cannot resolve ../dist/main.js -> error branch.
		const orphanBin = path.join(tmpDir, "turbo-ai.js");
		fs.copyFileSync(BIN_PATH, orphanBin);
		await assert.rejects(
			execFileAsync(process.execPath, [orphanBin, "--help"], { cwd: tmpDir, timeout: 15000 }),
			(err: { stderr?: string }) => {
				assert.match(err.stderr ?? "", /compiled output missing/);
				return true;
			},
		);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});
