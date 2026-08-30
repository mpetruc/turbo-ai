import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectGitInfo, gitGrep } from "../src/commands/commands.js";

function git(cwd: string, args: string[]): void {
	execFileSync("git", args, { cwd, stdio: "ignore" });
}

test("collectGitInfo handles dotted branch names, staged changes and renames", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-git-"));
	try {
		git(tmpDir, ["init", "-b", "feature/test.with.dot"]);
		git(tmpDir, ["config", "user.email", "test@example.com"]);
		git(tmpDir, ["config", "user.name", "Test User"]);
		fs.writeFileSync(path.join(tmpDir, "source.txt"), "one\n", "utf8");
		git(tmpDir, ["add", "source.txt"]);
		git(tmpDir, ["commit", "-m", "initial"]);
		fs.writeFileSync(path.join(tmpDir, "source.txt"), "one\ntwo\n", "utf8");
		git(tmpDir, ["add", "source.txt"]);
		fs.writeFileSync(path.join(tmpDir, "source.txt"), "one\ntwo\nthree\n", "utf8");

		let info = await collectGitInfo(tmpDir);
		assert.equal(info.branch, "feature/test.with.dot");
		assert.equal(info.added, 2);
		assert.ok(info.dirtyFiles.includes("source.txt"));

		git(tmpDir, ["add", "source.txt"]);
		git(tmpDir, ["commit", "-m", "update"]);
		git(tmpDir, ["mv", "source.txt", "renamed file.txt"]);
		info = await collectGitInfo(tmpDir);
		assert.ok(info.dirtyFiles.includes("renamed file.txt"));
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("gitGrep treats shell metacharacters as literal query text", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-grep-"));
	try {
		git(tmpDir, ["init"]);
		fs.writeFileSync(path.join(tmpDir, "tracked.txt"), "safe needle\n", "utf8");
		git(tmpDir, ["add", "tracked.txt"]);
		assert.deepEqual(await gitGrep(tmpDir, "needle"), ["tracked.txt:1:safe needle"]);
		const marker = path.join(tmpDir, "injected.txt");
		const results = await gitGrep(tmpDir, `needle\"; echo bad > ${marker}`);
		assert.deepEqual(results, ["No matches found."]);
		assert.equal(fs.existsSync(marker), false);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});
