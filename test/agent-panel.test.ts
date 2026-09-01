import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentPanel } from "../src/ui/agent-panel.js";
import { Screen } from "../src/ui/screen.js";

/** Render the panel into a real Screen and read back the trimmed inner rows. */
function renderRows(panel: AgentPanel, rect: { x: number; y: number; w: number; h: number }): string[] {
	const screen = new Screen(120, 40);
	panel.render(screen, rect, true);
	const rows: string[] = [];
	for (let r = 0; r < rect.h - 2; r++) {
		let line = "";
		for (let x = rect.x + 1; x <= rect.x + rect.w - 2; x++) {
			line += screen.getCell(x, rect.y + 1 + r)?.ch ?? "?";
		}
		rows.push(line.replace(/\s+$/, ""));
	}
	return rows;
}

test("AgentPanel wraps agent prose at word boundaries", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "agent", text: "the quick brown fox jumps over the lazy dog" });
	const rows = renderRows(p, { x: 20, y: 1, w: 20, h: 10 }); // inner width 18
	assert.equal(rows[0], "the quick brown");
	assert.equal(rows[1], "fox jumps over");
	assert.equal(rows[2], "the lazy dog");
});

test("AgentPanel re-wraps prose when the pane width changes", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "agent", text: "the quick brown fox jumps over the lazy dog" });
	const narrow = renderRows(p, { x: 20, y: 1, w: 20, h: 10 }); // inner width 18
	assert.equal(narrow[0], "the quick brown");

	const wide = renderRows(p, { x: 20, y: 1, w: 40, h: 10 }); // inner width 38
	assert.equal(wide[0], "the quick brown fox jumps over the");
	assert.equal(wide[1], "lazy dog");
});

test("AgentPanel wraps tool output instead of truncating it", () => {
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", tag: "[BASH]", text: "alpha beta gamma delta" });
	const rows = renderRows(p, { x: 12, y: 1, w: 22, h: 10 }); // inner width 20, body width 12
	assert.equal(rows[0], "[BASH]   alpha beta");
	assert.equal(rows[1], "gamma delta");
});

test("AgentPanel hard-breaks unbreakable words without losing characters", () => {
	const word = "A".repeat(40);
	const p = new AgentPanel();
	p.addEntry({ kind: "agent", text: word });
	const rows = renderRows(p, { x: 20, y: 1, w: 20, h: 10 }); // inner width 18
	assert.equal(rows[0], "A".repeat(18));
	assert.equal(rows.join(""), "A".repeat(40));
});
