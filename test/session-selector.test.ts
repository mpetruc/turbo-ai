import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionSelector } from "../src/ui/session-selector.js";
import { getProjectSessions, parseJsonlSession, type SessionSummary } from "../src/commands/commands.js";
import { Screen } from "../src/ui/screen.js";

test("SessionSelector navigation, pagination and digit search", () => {
	const selector = new SessionSelector(120, 40);
	const dummySessions: SessionSummary[] = [
		{ id: "s1.jsonl", title: "Session 1", firstPrompt: "Fix authentication issue", date: "2026-08-26 14:00", path: "/s1.jsonl", mtime: 1000, kind: "pi" },
		{ id: "s2.jsonl", title: "Session 2", firstPrompt: "Add dark mode theme", date: "2026-08-26 13:00", path: "/s2.jsonl", mtime: 900, kind: "pi" },
		{ id: "s3.jsonl", title: "Session 3", firstPrompt: "Refactor status bar", date: "2026-08-26 12:00", path: "/s3.jsonl", mtime: 800, kind: "pi" },
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
		{ id: "s1.jsonl", title: "SESSION1.PAS", firstPrompt: "Implement login view", date: "2026-08-26 14:00", path: "/s1.jsonl", mtime: 1000, kind: "pi" },
	]);

	selector.render(screen);
	assert.ok(selector.rect.w > 0);
	assert.ok(selector.rect.h > 0);
});

test("getProjectSessions scans project directory and returns sessions", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-sessions-test-"));
	try {
		// Create a saved markdown session
		const mdPath = path.join(tmpDir, "NONAME00.md");
		fs.writeFileSync(mdPath, "# Session transcript\nUser: hello", "utf8");

		const sessions = await getProjectSessions(tmpDir);
		assert.ok(sessions.length >= 1);
		assert.equal(sessions[0]?.title, "NONAME00.md");
		assert.equal(sessions[0]?.kind, "transcript");
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("parseJsonlSession returns history without mutating a panel", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-load-jsonl-"));

	try {
		const jsonlPath = path.join(tmpDir, "test-session.jsonl");
		const sampleLines = [
			JSON.stringify({ type: "session", version: 3, id: "abc", cwd: tmpDir, sessionName: "TEST_SESSION" }),
			JSON.stringify({ type: "model_change", provider: "openrouter", modelId: "deepseek-r1" }),
			JSON.stringify({ type: "thinking_level_change", thinkingLevel: "high" }),
			JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "How to fix the auth bug?" }] } }),
			JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "Analyzing..." }, { type: "text", text: "Here is the fix." }] } }),
		].join("\n");

		fs.writeFileSync(jsonlPath, sampleLines, "utf8");

		const meta = parseJsonlSession(jsonlPath);
		assert.equal(meta.title, "TEST_SESSION");
		assert.equal(meta.model, "openrouter/deepseek-r1");
		assert.equal(meta.thinkingLevel, "high");

		assert.ok(meta.entries.some((entry) => entry.kind === "user" && entry.text.includes("auth bug")));
		assert.ok(meta.entries.some((entry) => entry.kind === "agent" && entry.text.includes("Here is the fix")));
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("getProjectSessions respects PI_CONFIG_DIR", async () => {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-project-"));
	const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-config-"));
	const original = process.env.PI_CONFIG_DIR;
	try {
		process.env.PI_CONFIG_DIR = configDir;
		const sessionDir = path.join(configDir, "sessions", "project");
		fs.mkdirSync(sessionDir, { recursive: true });
		fs.writeFileSync(path.join(sessionDir, "session.jsonl"), [
			JSON.stringify({ type: "session", cwd: projectDir, sessionName: "CONFIG_SESSION" }),
			JSON.stringify({ type: "message", message: { role: "user", content: "hello" } }),
		].join("\n"), "utf8");
		const sessions = await getProjectSessions(projectDir);
		assert.equal(sessions.length, 1);
		assert.equal(sessions[0]?.title, "CONFIG_SESSION");
		assert.equal(sessions[0]?.kind, "pi");
	} finally {
		if (original === undefined) delete process.env.PI_CONFIG_DIR;
		else process.env.PI_CONFIG_DIR = original;
		fs.rmSync(projectDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	}
});
