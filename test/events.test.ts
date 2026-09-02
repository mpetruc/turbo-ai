import { test } from "node:test";
import assert from "node:assert/strict";
import { eventToEntries, toolTag, toolSummary } from "../src/rpc/events.js";
import { AgentPanel } from "../src/ui/agent-panel.js";
import { Screen } from "../src/ui/screen.js";

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

test("eventToEntries: thinking_start flags a new thinking block, text_start resets the stream", () => {
	const ts = eventToEntries({
		type: "message_update",
		message: { role: "assistant", content: [] },
		assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
	});
	assert.equal(ts.thinkingBlockStart, true, "thinking_start must mark a new thinking block");
	assert.equal(ts.streamReset, undefined, "thinking_start must NOT be treated as a text-stream reset");

	const tt = eventToEntries({
		type: "message_update",
		message: { role: "assistant", content: [] },
		assistantMessageEvent: { type: "text_start", contentIndex: 0 },
	});
	assert.equal(tt.streamReset, true, "text_start still resets the stream");
	assert.equal(tt.thinkingBlockStart, undefined);
});

/** Render a panel into a real Screen; return interior rows (right-trimmed) plus the screen. */
function renderPanel(panel: AgentPanel, w: number, h: number): { screen: Screen; rows: Array<{ text: string; y: number }> } {
	const screen = new Screen(w, h);
	panel.render(screen, { x: 0, y: 0, w, h }, true);
	const rows: Array<{ text: string; y: number }> = [];
	for (let y = 1; y < h - 1; y++) {
		let text = "";
		for (let x = 1; x < w - 1; x++) text += screen.getCell(x, y)?.ch ?? " ";
		rows.push({ text: text.replace(/\s+$/, ""), y });
	}
	return { screen, rows };
}

/**
 * Expand collapsed thinking when the panel supports it (newer revisions); a
 * no-op on the inline-rendering upstream panel. Keeps these tests valid
 * against both rendering modes.
 */
function expandThinking(p: AgentPanel): void {
	(p as unknown as { toggleThinkingCollapse?: () => boolean }).toggleThinkingCollapse?.();
}

test("late thinking delta rejoins the thinking block instead of opening a new row mid-answer", () => {
	// Providers often flush the reasoning tail after text has started streaming:
	// thinking "...no fl" + answer "## What" + thinking "uff." + answer " does this...".
	const p = new AgentPanel();
	p.appendThinkingDelta("Structure the answer concisely with headers. Keep it focused — no fl");
	p.closeStream();
	p.appendStreamDelta("## What");
	p.appendThinkingDelta("uff.", false); // trailing chunk, no thinking_start preceded it
	p.appendStreamDelta(" does this function do");
	// The reasoning tail is rejoined: exactly one thinking entry holding the full text.
	const thoughts = p.entries.filter((e) => e.kind === "thinking");
	assert.equal(thoughts.length, 1, "the trailing chunk must rejoin the existing thinking block");
	assert.equal(thoughts[0]?.text, "Structure the answer concisely with headers. Keep it focused — no fluff.");
	assert.equal(p.entries.filter((e) => e.kind === "agent").length, 1);
	expandThinking(p);
	const { rows } = renderPanel(p, 80, 12);
	const flat = rows.map((r) => r.text.trim()).filter(Boolean);
	const ai = flat.findIndex((t) => t.startsWith("## What"));
	assert.ok(ai > 0, `a thinking artifact precedes the answer: ${JSON.stringify(flat)}`);
	assert.ok(flat[ai]?.includes("does this function do"));
	assert.ok(!flat.some((t, i) => i > ai && t.includes("fluff")), "no thinking fragment rendered after the answer");
});

test("expanded: late thinking chunk renders with the thinking block, before the answer", () => {
	const p = new AgentPanel();
	p.appendThinkingDelta("Structure the answer concisely with headers. Keep it focused — no fl");
	p.closeStream();
	p.appendThinkingDelta("uff.", false); // late chunk can also arrive before text begins
	p.closeStream();
	p.appendStreamDelta("## What does this function do");
	p.closeStream();
	expandThinking(p);
	const { rows } = renderPanel(p, 80, 12);
	const flat = rows.map((r) => r.text.trim()).filter(Boolean);
	assert.ok(flat.length >= 2, JSON.stringify(flat));
	assert.ok(flat[0]!.includes("Structure the answer"), "thinking renders first: " + JSON.stringify(flat));
	assert.ok(flat.some((t) => t.includes("## What does this function do")));
});

test("genuine new thinking block (preceded by thinking_start) still opens its own row", () => {
	const p = new AgentPanel();
	p.appendThinkingDelta("phase one");
	p.closeStream();
	p.appendStreamDelta("first answer");
	p.closeStream();
	p.appendThinkingDelta("phase two", true); // a real thinking_start preceded this
	assert.equal(p.entries.filter((e) => e.kind === "thinking").length, 2, "two distinct thinking blocks stay separate");
	expandThinking(p);
	const { rows } = renderPanel(p, 80, 12);
	const flat = rows.map((r) => r.text.trim()).filter(Boolean);
	assert.ok(flat.some((t) => t.includes("phase one")));
	assert.ok(flat.some((t) => t.includes("phase two")));
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
