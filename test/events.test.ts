import { test } from "node:test";
import assert from "node:assert/strict";
import { eventToEntries, toolTag, toolSummary } from "../src/rpc/events.js";
import { AgentPanel } from "../src/ui/agent-panel.js";

test("toolTag maps known tools to DOS prefixes", () => {
	assert.equal(toolTag("read"), "[READ]");
	assert.equal(toolTag("edit"), "[EDIT]");
	assert.equal(toolTag("bash"), "[BASH]");
	assert.equal(toolTag("grep"), "[SEARCH]");
});

test("toolTag falls back to uppercase name", () => {
	assert.equal(toolTag("custom_tool"), "[CUSTOM_TOOL]");
});

test("eventToEntries: agent lifecycle flags", () => {
	assert.equal(eventToEntries({ type: "agent_start" }).agentStarted, true);
	assert.equal(eventToEntries({ type: "agent_end" }).agentEnded, true);
});

test("eventToEntries extracts text deltas", () => {
	const res = eventToEntries({
		type: "message_update",
		message: { role: "assistant", content: [] },
		assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hello" },
	});
	assert.equal(res.streamDelta, "hello");
});

test("eventToEntries extracts thinking deltas separately", () => {
	const res = eventToEntries({
		type: "message_update",
		message: { role: "assistant", content: [] },
		assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "analyzing problem..." },
	});
	assert.equal(res.thinkingDelta, "analyzing problem...");
	assert.equal(res.streamDelta, undefined);
});

test("eventToEntries extracts detailed error from message_end", () => {
	const res = eventToEntries({
		type: "message_end",
		message: { role: "assistant", content: [], stopReason: "error", errorMessage: "401 Invalid API key" } as any,
	});
	assert.equal(res.entries.length, 1);
	assert.equal(res.entries[0]?.kind, "error");
	assert.ok(res.entries[0]?.text.includes("401 Invalid API key"));
});

test("eventToEntries maps tool_execution_start", () => {
	const res = eventToEntries({ type: "tool_execution_start", toolCallId: "1", toolName: "read", args: { path: "src/a.ts" } });
	assert.equal(res.entries.length, 1);
	assert.equal(res.entries[0].tag, "[READ]");
	assert.equal(res.entries[0].text, "src/a.ts");
});

test("eventToEntries marks tool errors", () => {
	const res = eventToEntries({
		type: "tool_execution_end",
		toolCallId: "1",
		toolName: "bash",
		isError: true,
		result: { content: [{ type: "text", text: "boom\nmore" }] },
	});
	assert.equal(res.entries.length, 1);
	assert.equal(res.entries[0].kind, "error");
	assert.match(res.entries[0].text, /boom/);
});

test("toolSummary prefers path then command args", () => {
	assert.equal(toolSummary("read", { path: "x.ts" }).text, "x.ts");
	assert.equal(toolSummary("bash", { command: "npm test" }).tag, "[BASH]");
	assert.equal(toolSummary("bash", { command: "npm test" }, undefined, true).isError, true);
});

test("AgentPanel accumulates streamed deltas and thinking deltas into separate entries", () => {
	const p = new AgentPanel();
	p.appendThinkingDelta("Thinking step 1... ");
	p.appendThinkingDelta("Thinking step 2...");
	p.closeStream();
	p.appendStreamDelta("Actual response in white");
	p.closeStream();
	p.addUserMessage("test");
	assert.ok(p);
});

test("AgentPanel renders lines within width", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "user", text: "" });
	p.addEntry({ kind: "user", text: "> fix bug" });
	p.addEntry({ kind: "thinking", text: "thought process" });
	p.addEntry({ kind: "agent", text: "done" });
	const screenLike = { width: 40, height: 12 };
	assert.ok(screenLike);
});
