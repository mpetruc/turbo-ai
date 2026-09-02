import { test } from "node:test";
import assert from "node:assert/strict";
import { Screen, charDisplayWidth } from "../src/ui/screen.js";
import { AgentPanel } from "../src/ui/agent-panel.js";

/**
 * Minimal wcwidth for the test harness only — mirrors how a real VT terminal
 * lays out wide characters (CJK / emoji occupy two columns).
 */
function simWidth(ch: string): number {
	return charDisplayWidth(ch);
}

/**
 * Feed raw flush output into a simulated terminal with DECAWM autowrap:
 * a printable char received while the cursor is at/past the last column goes
 * to the next row, column 0. CUP repositions; SGR is ignored.
 */
function simulateTerminal(out: string, cols: number, rows: number): string[][] {
	const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(" "));
	let cx = 0;
	let cy = 0;
	let i = 0;
	while (i < out.length) {
		const ch = out[i]!;
		if (ch === "\x1b") {
			if (out[i + 1] === "[") {
				let stop = i + 2;
				while (stop < out.length && !"mHlhJ".includes(out[stop]!)) stop++;
				const seq = out.slice(i, stop + 1);
				const cup = /^\x1b\[(\d+);(\d+)H$/.exec(seq);
				if (cup) {
					cx = Number(cup[2]) - 1;
					cy = Number(cup[1]) - 1;
				} else if (seq === "\x1b[2J") {
					for (const r of grid) r.fill(" ");
				}
				i = stop + 1;
				continue;
			}
			i += 2;
			continue;
		}
		const w = simWidth(ch);
		if (cx >= cols) {
			cy += 1;
			cx = 0;
		}
		if (cy < rows) {
			for (let k = 0; k < w && cx + k < cols; k++) grid[cy][cx + k] = k === 0 ? ch : grid[cy][cx + k];
		}
		cx += w;
		i += 1;
	}
	return grid;
}

// ---------------------------------------------------------------- charDisplayWidth

test("charDisplayWidth: ASCII and box-drawing chars are 1 column", () => {
	assert.equal(charDisplayWidth("a"), 1);
	assert.equal(charDisplayWidth(" "), 1);
	assert.equal(charDisplayWidth("║"), 1);
	assert.equal(charDisplayWidth("▸"), 1);
	assert.equal(charDisplayWidth("\x1b"), 1);
});

test("charDisplayWidth: CJK, Hangul and fullwidth forms are 2 columns", () => {
	assert.equal(charDisplayWidth("文"), 2);
	assert.equal(charDisplayWidth("数"), 2);
	assert.equal(charDisplayWidth("가"), 2);
	assert.equal(charDisplayWidth("＃"), 2);
});

test("charDisplayWidth: emoji surrogate pair is 2 columns total", () => {
	const emoji = "\u{1F600}"; // 😀
	assert.equal(emoji.length, 2, "emoji is a surrogate pair");
	assert.equal(charDisplayWidth(emoji[0]!) + charDisplayWidth(emoji[1]!), 2);
});

// ---------------------------------------------------------------- Screen placement

test("Screen: a wide char occupies two cells (continuation in x+1)", () => {
	const s = new Screen(20, 2);
	s.setCell(5, 0, "文", 1);
	assert.equal(s.getCell(5, 0)?.ch, "文");
	assert.equal(s.getCell(6, 0)?.ch, "\u0000", "continuation cell is marked so flush skips it");
	// A narrow char placed after a wide char goes to x+2, not x+1
	s.setCell(7, 0, "b", 1);
	assert.equal(s.getCell(7, 0)?.ch, "b");
});

test("Screen: wide char at the last column is clipped, not wrapped", () => {
	const s = new Screen(10, 2);
	s.setCell(9, 0, "文", 1);
	assert.equal(s.getCell(9, 0)?.ch, " ", "wide char does not fit at the last column");
});

test("Screen: text() places wide chars at 2-column strides and clips inside bounds", () => {
	const s = new Screen(10, 2);
	s.text(0, 0, "a文b", 1);
	assert.deepEqual(
		[0, 1, 2, 3, 4].map((x) => s.getCell(x, 0)?.ch),
		["a", "文", "\u0000", "b", " "],
	);
	assert.equal(s.getCell(5, 0)?.ch, " ", "text stopped at the width boundary");
});

test("Screen: flush output contains no continuation markers and no NUL bytes", () => {
	const s = new Screen(20, 2);
	s.text(0, 0, "a文b", 1);
	const out = s.flush();
	assert.ok(!out.includes("\u0000"), "no NUL in stream");
	assert.ok(out.includes("文"), "wide char itself is emitted");
});

// ---------------------------------------------------------------- wrapping

test("wrapText wraps by display columns, not character count (lossless)", () => {
	const p = new AgentPanel();
	// "文".repeat(30) is 60 display columns; wrapped at width 20 -> 3 chunks of 10 chars each
	p.addEntry({ kind: "agent", text: "文".repeat(30) });
	const screen = new Screen(22, 10); // inner width 20
	p.render(screen, { x: 0, y: 0, w: 22, h: 10 }, true);
	const rows: string[] = [];
	for (let y = 1; y < 9; y++) {
		let t = "";
		for (let x = 1; x < 21; x++) {
			const ch = screen.getCell(x, y)?.ch ?? "";
			if (ch !== "\u0000") t += ch; // continuation cells are consumed by the char before them
		}
		rows.push(t.replace(/\s+$/, ""));
	}
	assert.equal(rows[0], "文".repeat(10), "20 columns fit exactly 10 wide chars");
	assert.equal(rows[1], "文".repeat(10));
	assert.equal(rows[2], "文".repeat(10));
	assert.equal(rows.filter((r) => r.length > 0).join(""), "文".repeat(30), "no characters lost");
});

// -------------------------------------------------- regression: no leak into the files pane

test("wide tool output never leaks into files-pane columns (incremental update)", () => {
	const COLS = 100;
	const ROWS = 30;
	const treeW = 28;
	const pane = { x: treeW, y: 1, w: COLS - treeW, h: 24 };

	const screen = new Screen(COLS, ROWS);
	const p = new AgentPanel();
	p.addEntry({ kind: "tool", text: "read 文件列表", tag: "[READ]", toolCallId: "t1", pending: true });
	p.updateToolEntry("t1", "before", false, true);
	p.render(screen, pane, true);
	screen.flush(); // baseline frame (as if already displayed)

	// The tool result arrives with wide characters — incremental change only.
	p.updateToolEntry("t1", "数据: " + "文".repeat(55) + " 尾部 END", false, true);
	p.render(screen, pane, true);
	const out = screen.flush();
	const grid = simulateTerminal(out, COLS, ROWS);

	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < treeW; x++) {
			const ch = grid[y][x]!;
			assert.equal(ch, " ", `files-pane cell (${x},${y}) was overwritten with ${JSON.stringify(ch)}`);
		}
	}
});

test("agent prose with wide chars stays inside the agent pane (full repaint)", () => {
	const COLS = 100;
	const ROWS = 30;
	const treeW = 28;
	const pane = { x: treeW, y: 1, w: COLS - treeW, h: 24 };

	const screen = new Screen(COLS, ROWS);
	const p = new AgentPanel();
	p.addEntry({ kind: "agent", text: "总结： " + "文".repeat(200) });
	p.render(screen, pane, true);
	const grid = simulateTerminal(screen.flush(), COLS, ROWS);
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < treeW; x++) {
			const ch = grid[y][x]!;
			assert.equal(ch, " ", `files-pane cell (${x},${y}) was overwritten with ${JSON.stringify(ch)}`);
		}
	}
});
