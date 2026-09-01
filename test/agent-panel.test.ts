import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentPanel } from "../src/ui/agent-panel.js";
import { Screen } from "../src/ui/screen.js";
import { THEME, packAttr } from "../src/theme/turbo-pascal.js";

interface RowInfo {
	text: string;
	y: number;
}

/** Render a panel into a real Screen; return interior rows (right-trimmed) plus the screen for attr reads. */
function renderPanel(panel: AgentPanel, w: number, h: number): { screen: Screen; rows: RowInfo[] } {
	const screen = new Screen(w, h);
	panel.render(screen, { x: 0, y: 0, w, h }, true);
	const rows: RowInfo[] = [];
	for (let y = 1; y < h - 1; y++) {
		let text = "";
		for (let x = 1; x < w - 1; x++) text += screen.getCell(x, y)?.ch ?? " ";
		rows.push({ text: text.replace(/\s+$/, ""), y });
	}
	return { screen, rows };
}

/** Packed attribute at the leftmost interior cell of a rendered row. */
function rowAttr(screen: Screen, row: RowInfo): number {
	return screen.getCell(1, row.y)?.attr ?? -1;
}

test("updateToolEntry renders a dimmed result excerpt plus remaining-line ellipsis", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "npm test", tag: "[BASH]", toolCallId: "t1" });
	p.updateToolEntry(
		"t1",
		["line1", "line2", "line3", "line4", "line5", "line6", "line7", "line8", "line9", "line10", "line11", "line12"].join("\n"),
		false,
		true,
	);
	const { rows } = renderPanel(p, 40, 22);
	assert.ok(rows.some((r) => r.text.includes("[BASH]") && r.text.includes("npm test")), "tag row keeps the tool call");
	assert.ok(rows.some((r) => r.text.includes("line1")));
	assert.ok(rows.some((r) => r.text.includes("line10")));
	assert.ok(rows.some((r) => r.text.includes("… (2 more lines, Ctrl+O to expand)")), "ellipsis reports the hidden lines and the expand hint");
});

test("updateToolEntry with exactly 10 result lines shows no ellipsis", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "cmd", tag: "[RUN]", toolCallId: "t2" });
	p.updateToolEntry("t2", Array.from({ length: 10 }, (_, i) => `r${i}`).join("\n"), false, true);
	const { rows } = renderPanel(p, 40, 14);
	assert.ok(rows.some((r) => r.text.includes("r9")));
	assert.ok(!rows.some((r) => r.text.includes("more lines")));
});

test("updateToolEntry without a matching tool row falls back to a new entry", () => {
	const p = new AgentPanel();
	p.updateToolEntry("t9", "orphan result text", false, true);
	const { rows } = renderPanel(p, 40, 5);
	assert.ok(rows.some((r) => r.text.includes("orphan result text")));
});

test("settled collapsed thinking uses the thinkingText attr and hides the reasoning text", () => {
	const p = new AgentPanel();
	p.appendThinkingDelta("hidden reasoning step 1\nmore reasoning");
	p.closeStream();
	const { screen, rows } = renderPanel(p, 40, 10);
	const thinkingRow = rows.find((r) => r.text.includes("Thinking"));
	assert.ok(thinkingRow, "a collapsed thinking row exists");
	assert.equal(rowAttr(screen, thinkingRow!), packAttr(THEME.thinkingText), "settled collapsed row uses the thinkingText attr");
	assert.ok(thinkingRow!.text.includes("▸ Thinking"), "settled label is the static form");
	assert.ok(!rows.some((r) => r.text.includes("hidden reasoning")), "reasoning is hidden when collapsed");
});

test("live thinking uses the thinkingLive attr with spinner and elapsed", () => {
	const p = new AgentPanel();
	p.appendThinkingDelta("live reasoning in progress");
	const screen = new Screen(40, 10);
	p.render(screen, { x: 0, y: 0, w: 40, h: 10 }, true, undefined, { spinner: "◐", elapsedSec: 1.2 });
	let text = "";
	for (let x = 1; x < 39; x++) text += screen.getCell(x, 1)?.ch ?? " ";
	const row = { text: text.replace(/\s+$/, ""), y: 1 };
	assert.ok(row.text.includes("▸ Thinking [ ◐ ] (1.2s)"), `live label, got: ${row.text}`);
	assert.equal(screen.getCell(1, 1)?.attr, packAttr(THEME.thinkingLive));
});

test("expanded thinking renders the reasoning text", () => {
	const p = new AgentPanel();
	p.appendThinkingDelta("visible reasoning");
	p.closeStream();
	p.toggleThinkingCollapse();
	const { rows } = renderPanel(p, 40, 10);
	assert.ok(rows.some((r) => r.text.includes("visible reasoning")));
});

test("pending tool row uses the toolPending background", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "npm test", tag: "[BASH]", toolCallId: "t1", pending: true });
	const { screen, rows } = renderPanel(p, 40, 6);
	const toolRow = rows.find((r) => r.text.includes("[BASH]"));
	assert.ok(toolRow);
	assert.equal(rowAttr(screen, toolRow!), packAttr(THEME.toolPending));
});

test("final update with empty text still settles the pending row", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "npm test", tag: "[BASH]", toolCallId: "t1", pending: true });
	p.updateToolEntry("t1", "", false, true);
	const { screen, rows } = renderPanel(p, 40, 6);
	const toolRow = rows.find((r) => r.text.includes("[BASH]"));
	assert.ok(toolRow);
	assert.notEqual(rowAttr(screen, toolRow!), packAttr(THEME.toolPending), "pending background is cleared");
});

test("settleAllPending clears every tool row on turn end", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "a", tag: "[BASH]", toolCallId: "t1", pending: true });
	p.addEntry({ kind: "tool", text: "b", tag: "[RUN]", toolCallId: "t2", pending: true });
	p.settleAllPending();
	const { screen, rows } = renderPanel(p, 40, 8);
	for (const r of rows.filter((r) => r.text.startsWith("["))) {
		assert.notEqual(rowAttr(screen, r), packAttr(THEME.toolPending), `row "${r.text}" is no longer pending`);
	}
});

test("fallback update settles only the pending row and never overwrites a settled result", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "old cmd", tag: "[BASH]", toolCallId: "t1", resultText: "done", isError: false });
	p.addEntry({ kind: "tool", text: "npm test", tag: "[BASH]", toolCallId: "t2", pending: true });
	p.updateToolEntry("t999", "last result", false, true);
	const { screen, rows } = renderPanel(p, 40, 8);
	assert.ok(rows.some((r) => r.text.includes("done")), "settled row's result is untouched");
	assert.ok(rows.some((r) => r.text.includes("last result")), "result attaches to the pending row");
	assert.ok(!rows.some((r) => rowAttr(screen, r) === packAttr(THEME.toolPending)), "no row stays pending");
});

test("completed tool result lines use toolResultText", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "npm test", tag: "[BASH]", toolCallId: "t1", pending: true });
	p.updateToolEntry("t1", "all pass", false, true);
	const { screen, rows } = renderPanel(p, 40, 8);
	const resultRow = rows.find((r) => r.text.includes("all pass"));
	assert.ok(resultRow);
	assert.equal(rowAttr(screen, resultRow!), packAttr(THEME.toolResultText));
});

test("tool output can be expanded past the preview", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "cmd", tag: "[RUN]", toolCallId: "t1" });
	p.updateToolEntry("t1", Array.from({ length: 12 }, (_, i) => `line${i}`).join("\n"), false, true);
	p.toggleToolOutputExpanded();
	const { rows } = renderPanel(p, 60, 20);
	assert.ok(rows.some((r) => r.text.includes("line11")), "expanded output shows all lines");
	assert.ok(!rows.some((r) => r.text.includes("more lines")), "no ellipsis when expanded");
});

test("AgentPanel wraps agent prose at word boundaries", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "agent", text: "the quick brown fox jumps over the lazy dog" });
	const rows = renderPanel(p, 20, 10).rows; // inner width 18
	assert.equal(rows[0]?.text, "the quick brown");
	assert.equal(rows[1]?.text, "fox jumps over");
	assert.equal(rows[2]?.text, "the lazy dog");
});

test("AgentPanel re-wraps prose when the pane width changes", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "agent", text: "the quick brown fox jumps over the lazy dog" });
	const narrow = renderPanel(p, 20, 10).rows; // inner width 18
	assert.equal(narrow[0]?.text, "the quick brown");

	const wide = renderPanel(p, 40, 10).rows; // inner width 38
	assert.equal(wide[0]?.text, "the quick brown fox jumps over the");
	assert.equal(wide[1]?.text, "lazy dog");
});

test("AgentPanel wraps tool output instead of truncating it", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", tag: "[BASH]", text: "alpha beta gamma delta" });
	const rows = renderPanel(p, 22, 10).rows; // inner width 20, body width 14
	assert.equal(rows[0]?.text, "[BASH]   alpha beta");
	assert.equal(rows[1]?.text, "gamma delta");
});

test("AgentPanel hard-breaks unbreakable words without losing characters", () => {
	const word = "A".repeat(40);
	const p = new AgentPanel();
	p.addEntry({ kind: "agent", text: word });
	const rows = renderPanel(p, 20, 10).rows; // inner width 18
	assert.equal(rows[0]?.text, "A".repeat(18));
	assert.equal(rows.map((r) => r.text).join(""), "A".repeat(40));
});
