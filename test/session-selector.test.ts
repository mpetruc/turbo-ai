import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionSelector } from "../src/ui/session-selector.js";
import { getProjectSessions, type SessionSummary } from "../src/commands/commands.js";
import { Screen } from "../src/ui/screen.js";

test("SessionSelector navigation, pagination and digit search", () => {
	const selector = new SessionSelector(120, 40);
	const dummySessions: SessionSummary[] = [
		{ id: "s1.jsonl", title: "Session 1", firstPrompt: "Fix authentication issue", date: "2026-08-26 14:00", path: "/s1.jsonl", mtime: 1000 },
		{ id: "s2.jsonl", title: "Session 2", firstPrompt: "Add dark mode theme", date: "2026-08-26 13:00", path: "/s2.jsonl", mtime: 900 },
		{ id: "s3.jsonl", title: "Session 3", firstPrompt: "Refactor status bar", date: "2026-08-26 12:00", path: "/s3.jsonl", mtime: 800 },
	];

	selector.setSessions(dummySessions);
	assert.equal(selector.sessions.length, 3);
	assert.equal(selector.current()?.id, "s1.jsonl");

	selector.down();
	assert.equal(selector.current()?.id, "s2.jsonl");

	selector.down();
	assert.equal(selector.current()?.id, "s3.jsonl");

	// Clamped at bottom
	selector.down();
	assert.equal(selector.current()?.id, "s3.jsonl");

	selector.up();
	assert.equal(selector.current()?.id, "s2.jsonl");

	selector.home();
	assert.equal(selector.current()?.id, "s1.jsonl");

	selector.end();
	assert.equal(selector.current()?.id, "s3.jsonl");

	// Digit jumps
	selector.findByDigit("1");
	assert.equal(selector.current()?.id, "s1.jsonl");

	selector.findByDigit("2");
	assert.equal(selector.current()?.id, "s2.jsonl");
});

test("SessionSelector renders into Screen without errors", () => {
	const screen = new Screen();
	screen.resize(120, 40);
	const selector = new SessionSelector(120, 40);
	selector.setSessions([
		{ id: "s1.jsonl", title: "SESSION1.PAS", firstPrompt: "Implement login view", date: "2026-08-26 14:00", path: "/s1.jsonl", mtime: 1000 },
	]);

	selector.render(screen);
	assert.ok(selector.rect.w > 0);
	assert.ok(selector.rect.h > 0);
});

test("getProjectSessions scans project directory and returns sessions", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-sessions-test-"));
	try {
		// Create a saved markdown session
		const mdPath = path.join(tmpDir, "NONAME00.md");
		fs.writeFileSync(mdPath, "# Session transcript\nUser: hello", "utf8");

		const sessions = getProjectSessions(tmpDir);
		assert.ok(sessions.length >= 1);
		assert.equal(sessions[0]?.title, "NONAME00.md");
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});
