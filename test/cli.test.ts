import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseCliArgs } from "../src/utils/cli.js";

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
