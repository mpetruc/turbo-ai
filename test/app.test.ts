import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { App } from "../src/main.js";
import { PiClient } from "../src/rpc/pi-client.js";
import { AgentPanel } from "../src/ui/agent-panel.js";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-pi.mjs");

interface AppInternals {
	switchWorkingDirectory(value: string): Promise<void>;
	loadRecentSession(value: string): Promise<void>;
	client: PiClient;
	panel: AgentPanel;
}

test("App changes cwd only after the replacement Pi client is ready", async () => {
	const first = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-app-first-"));
	const second = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-app-second-"));
	const factory = (cwd: string) => new PiClient({ command: process.execPath, args: [fixture], cwd });
	const app = new App(first, factory);
	const internal = app as unknown as AppInternals;
	try {
		await internal.switchWorkingDirectory(second);
		assert.equal(app.cwd, path.resolve(second));
	} finally {
		await internal.client.dispose();
		fs.rmSync(first, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
		fs.rmSync(second, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
	}
});

test("App preserves the current transcript when Pi rejects session switching", async () => {
	const project = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-app-session-"));
	const app = new App(project, (cwd) => new PiClient({ command: process.execPath, args: [fixture], cwd }));
	const internal = app as unknown as AppInternals;
	try {
		await internal.client.start();
		internal.panel.addEntry({ kind: "agent", text: "current transcript" });
		const sessionPath = path.join(project, "fail-session.jsonl");
		fs.writeFileSync(sessionPath, [
			JSON.stringify({ type: "session", cwd: project, sessionName: "FAILED" }),
			JSON.stringify({ type: "message", message: { role: "assistant", content: "replacement transcript" } }),
		].join("\n"), "utf8");
		await internal.loadRecentSession(sessionPath);
		const transcript = internal.panel.getExportText();
		assert.match(transcript, /current transcript/);
		assert.doesNotMatch(transcript, /replacement transcript/);
	} finally {
		await internal.client.dispose();
		fs.rmSync(project, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
	}
});

test("App keeps the current cwd when replacement Pi startup fails", async () => {
	const first = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-app-rollback-"));
	const second = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-app-target-"));
	const app = new App(first, (cwd) => new PiClient({ command: path.join(cwd, "missing-pi-executable"), args: [] }));
	const internal = app as unknown as AppInternals;
	try {
		await internal.switchWorkingDirectory(second);
		assert.equal(app.cwd, first);
	} finally {
		await internal.client.dispose();
		fs.rmSync(first, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
		fs.rmSync(second, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
	}
});
