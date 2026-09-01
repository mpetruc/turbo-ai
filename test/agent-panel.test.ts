import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentPanel } from "../src/ui/agent-panel.js";
import { Screen } from "../src/ui/screen.js";

/** Render a panel into a real Screen and return the interior rows (inside the border), right-trimmed. */
function renderRows(panel: AgentPanel, w: number, h: number): string[] {
	const screen = new Screen(w, h);
	panel.render(screen, { x: 0, y: 0, w, h }, true);
	const rows: string[] = [];
	for (let y = 1; y < h - 1; y++) {
		let line = "";
		for (let x = 1; x < w - 1; x++) line += screen.getCell(x, y)?.ch ?? " ";
		rows.push(line.replace(/\s+$/, ""));
	}
	return rows;
}

test("updateToolEntry renders a dimmed result excerpt plus remaining-line ellipsis", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "npm test", tag: "[BASH]", toolCallId: "t1" });
	p.updateToolEntry(
		"t1",
		["line1", "line2", "line3", "line4", "line5", "line6", "line7", "line8", "line9", "line10", "line11", "line12"].join("\n"),
		false,
	);
	const rows = renderRows(p, 40, 22);
	assert.ok(rows.some((r) => r.includes("[BASH]") && r.includes("npm test")), "tag row keeps the tool call");
	assert.ok(rows.some((r) => r.includes("line1")));
	assert.ok(rows.some((r) => r.includes("line10")));
	assert.ok(rows.some((r) => r.includes("… (2 more lines)")), "ellipsis reports the hidden lines");
});

test("updateToolEntry with exactly 10 result lines shows no ellipsis", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "cmd", tag: "[RUN]", toolCallId: "t2" });
	p.updateToolEntry("t2", Array.from({ length: 10 }, (_, i) => `r${i}`).join("\n"), false);
	const rows = renderRows(p, 40, 14);
	assert.ok(rows.some((r) => r.includes("r9")));
	assert.ok(!rows.some((r) => r.includes("more lines")));
});

test("updateToolEntry without a matching tool row falls back to a new entry", () => {
	const p = new AgentPanel();
	p.updateToolEntry("t9", "orphan result text", false);
	const rows = renderRows(p, 40, 5);
	assert.ok(rows.some((r) => r.includes("orphan result text")));
});

test("updateToolEntry never overwrites a settled row's result via fallback", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "npm test", tag: "[BASH]", toolCallId: "t1", resultText: "done", isError: false });
	p.updateToolEntry("t999", "result for a different call", false);
	const rows = renderRows(p, 40, 5);
	assert.ok(rows.some((r) => r.includes("done")), "settled row's result is untouched");
	assert.ok(rows.some((r) => r.includes("result for a different call")), "new row created instead");
});
