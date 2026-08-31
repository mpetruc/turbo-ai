import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { clipboardHelper, copyToClipboard } from "../src/commands/commands.js";

test("clipboardHelper returns null when no clipboard tool exists on PATH", () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), "clip-empty-"));
	try {
		assert.equal(clipboardHelper("linux", { PATH: dir }), null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("clipboardHelper resolves executable helper binaries on PATH", () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), "clip-fake-"));
	try {
		const fake = path.join(dir, "xclip");
		writeFileSync(fake, `#!${process.execPath}\n`, { mode: 0o755 });
		const helper = clipboardHelper("linux", { PATH: dir });
		assert.ok(helper, "expected xclip to be resolved");
		assert.equal(helper.cmd, fake);
		assert.deepEqual(helper.args, ["-selection", "clipboard"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("copyToClipboard does not crash when no clipboard tool exists (regression: spawn xclip ENOENT)", async () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), "clip-empty-"));
	const oldPath = process.env.PATH;
	process.env.PATH = dir;
	try {
		// Before the fix this spawned `xclip` with no 'error' listener, emitting an
		// unhandled 'error' event that crashed the process (spawn xclip ENOENT).
		const result = copyToClipboard("mouse selection text");
		assert.equal(result, true);
		// Give any stray async spawn error a chance to fire; surviving to the next
		// tick proves no crash occurred.
		await new Promise((r) => setTimeout(r, 100));
		assert.equal(result, true);
	} finally {
		process.env.PATH = oldPath;
		rmSync(dir, { recursive: true, force: true });
	}
});

test("copyToClipboard pipes text into an available clipboard helper", async () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), "clip-fake-"));
	const out = path.join(dir, "clipboard.txt");
	const fake = path.join(dir, "xclip");
	const script = `#!${process.execPath}\n`
		+ `const fs = require("node:fs");\n`
		+ `process.stdin.pipe(fs.createWriteStream(${JSON.stringify(out)}));\n`;
	writeFileSync(fake, script);
	chmodSync(fake, 0o755);

	const oldPath = process.env.PATH;
	process.env.PATH = dir;
	try {
		const text = "Copied via fake xclip helper";
		copyToClipboard(text);
		const deadline = Date.now() + 2000;
		while (Date.now() < deadline) {
			try {
				if (readFileSync(out, "utf8") === text) break;
			} catch {
				// helper may not have written yet
			}
			await new Promise((r) => setTimeout(r, 20));
		}
		assert.equal(readFileSync(out, "utf8"), text);
	} finally {
		process.env.PATH = oldPath;
		rmSync(dir, { recursive: true, force: true });
	}
});
