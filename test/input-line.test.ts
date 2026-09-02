import { test } from "node:test";
import assert from "node:assert/strict";
import { InputLine } from "../src/ui/input-line.js";
import { Screen } from "../src/ui/screen.js";
import type { Rect } from "../src/utils/layout.js";

// Window geometry used by the render tests: outer w=14 -> innerW=10 -> textW=8,
// outer h=4 -> innerH=2. Inner area starts at x=7, y=11 for the given rect.
const WIN: Rect = { x: 5, y: 10, w: 14, h: 4 };
const INNER_X = 7;
const INNER_Y = 11;

// ------------------------------------------------------------------- height

test("InputLine default height is one text row (outer 3)", () => {
	const input = new InputLine();
	assert.equal(input.getRequiredHeight(24), 3);
	assert.equal(input.getRequiredHeight(24, 10), 3);
});

test("InputLine height grows with wrapped rows (up to 8 text rows)", () => {
	const input = new InputLine();
	input.value = "hello world foo bar"; // wraps to 3 rows at width 10
	assert.equal(input.getRequiredHeight(24, 10), 5); // 3 text rows + 2 border

	input.value = "one two three four five"; // 5 rows at width 6
	assert.equal(input.getRequiredHeight(24, 6), 7);

	// Multiple physical lines count too (unwrapped fallback)
	input.value = "a\nb\nc";
	assert.equal(input.getRequiredHeight(24), 5);
});

test("InputLine caps adaptive height at 8 text rows (outer 10)", () => {
	const input = new InputLine();
	input.value = Array.from({ length: 9 }, (_, i) => `line${i}`).join("\n");
	assert.equal(input.getRequiredHeight(24), 10); // capped at 8 + 2

	// Terminal height cap still applies (floor(rows/2))
	assert.equal(input.getRequiredHeight(18, 10), 9);
});

// --------------------------------------------------------------------- wrap

test("InputLine wraps at word boundaries and hard-breaks long words", () => {
	const input = new InputLine();
	input.value = "hello world foo bar";
	assert.deepEqual(input.getVisualRows(10), [
		{ line: 0, start: 0, end: 6 },
		{ line: 0, start: 6, end: 16 },
		{ line: 0, start: 16, end: 19 },
	]);

	input.value = "abcdefghij klmnopqrs";
	assert.deepEqual(input.getVisualRows(8), [
		{ line: 0, start: 0, end: 8 },
		{ line: 0, start: 8, end: 11 },
		{ line: 0, start: 11, end: 19 },
		{ line: 0, start: 19, end: 20 },
	]);
});

test("InputLine keeps one visual row per physical line when never rendered", () => {
	const input = new InputLine();
	input.value = "ab\ncd";
	assert.deepEqual(input.getVisualRows(), [
		{ line: 0, start: 0, end: 2 },
		{ line: 1, start: 0, end: 2 },
	]);
	assert.deepEqual(input.getVisualRows(100), [
		{ line: 0, start: 0, end: 2 },
		{ line: 1, start: 0, end: 2 },
	]);
});

// ---------------------------------------------------------------- navigation

test("InputLine up/down navigate across wrapped rows preserving column", () => {
	const input = new InputLine();
	input.value = "hello world foo bar";
	input.cursorPos = input.value.length; // 19
	// Visual rows at width 10: "hello " (0-5), "world foo " (0-9), "bar" (0-2)

	assert.equal(input.up(10), true);
	assert.deepEqual(input.getCursorCoord(), { line: 0, col: 9 });
	assert.equal(input.up(10), true);
	assert.deepEqual(input.getCursorCoord(), { line: 0, col: 3 });
	assert.equal(input.up(10), false);

	assert.equal(input.down(10), true);
	assert.deepEqual(input.getCursorCoord(), { line: 0, col: 9 });
	assert.equal(input.down(10), true);
	assert.deepEqual(input.getCursorCoord(), { line: 0, col: 19 });
	assert.equal(input.down(10), false);

	// home/end stay physical: start/end of the physical line
	input.home();
	assert.deepEqual(input.getCursorCoord(), { line: 0, col: 0 });
	input.end();
	assert.deepEqual(input.getCursorCoord(), { line: 0, col: 19 });
});

test("InputLine up/down cross physical lines through wrapped rows", () => {
	const input = new InputLine();
	input.value = "ab\ncd ef gh";
	input.cursorPos = input.value.length; // 11 -> { line: 1, col: 8 }
	// Visual rows at width 4: "ab" / "cd " / "ef " / "gh"

	assert.deepEqual(input.getCursorCoord(), { line: 1, col: 8 });
	assert.equal(input.up(4), true);
	assert.deepEqual(input.getCursorCoord(), { line: 1, col: 5 });
	assert.equal(input.up(4), true);
	assert.deepEqual(input.getCursorCoord(), { line: 1, col: 2 });
	assert.equal(input.up(4), true);
	assert.deepEqual(input.getCursorCoord(), { line: 0, col: 2 });
	assert.equal(input.up(4), false);

	assert.equal(input.down(4), true);
	assert.deepEqual(input.getCursorCoord(), { line: 1, col: 2 });
	assert.equal(input.down(4), true);
	assert.deepEqual(input.getCursorCoord(), { line: 1, col: 5 });
	assert.equal(input.down(4), true);
	assert.deepEqual(input.getCursorCoord(), { line: 1, col: 8 });
	assert.equal(input.down(4), false);
});

// ------------------------------------------------------------------ scrolling

function renderedInput(value: string, rect: Rect = WIN): InputLine {
	const screen = new Screen(60, 20);
	const input = new InputLine();
	input.value = value;
	input.cursorPos = input.value.length;
	input.render(screen, rect, true);
	return input;
}

test("InputLine scrolls visual rows and sticks after manual scroll", () => {
	const screen = new Screen(60, 20);
	const input = renderedInput("a1\nb2\nc3\nd4\ne5");

	// 5 visual rows, innerH 2 -> overflows; cursor at end -> auto-scroll to 3
	assert.equal(input.hasOverflow(), true);
	assert.equal(input.scrollRow, 3);

	// Manual scroll sticks across renders (no snap-back to cursor)
	input.scrollBy(-10);
	assert.equal(input.scrollRow, 0);
	input.render(screen, WIN, true);
	assert.equal(input.scrollRow, 0);

	// Typing (cursor move) re-enables follow: scrollRow hugs the cursor again
	input.insert("!");
	assert.equal(input.scrollRow, 0); // unchanged until next render
	input.render(screen, WIN, true);
	assert.equal(input.scrollRow, 3);

	// Delete-only editing also re-enables follow (no stuck scrolled view)
	input.left(); // cursor off the very end so delete() mutates
	input.scrollBy(-10);
	input.render(screen, WIN, true);
	assert.equal(input.scrollRow, 0);
	input.delete();
	input.render(screen, WIN, true);
	assert.equal(input.scrollRow, 3);

	// scrollToRatio + scrollBy operate on visual-row space
	input.scrollToRatio(0.5);
	assert.equal(input.scrollRow, 2);
	input.scrollBy(1);
	assert.equal(input.scrollRow, 3);
	input.scrollBy(100);
	assert.equal(input.scrollRow, 3); // clamped to max (5 rows - 2 visible)
	assert.equal(input.getThumbRow(10), 9); // at max offset, thumb at bottom
	input.scrollBy(-100);
	assert.equal(input.scrollRow, 0);
});

test("InputLine hasOverflow detects wrapped and multi-line overflow", () => {
	const screen = new Screen(60, 20);

	// Single long line wraps into 4 visual rows at textW 8 -> overflow in 2 rows
	const wrapped = renderedInput("a b c d e f g h i j");
	assert.equal(wrapped.hasOverflow(), true);

	// Short text fits
	const short = renderedInput("hi");
	assert.equal(short.hasOverflow(), false);
	void screen;
});

// -------------------------------------------------------------------- render

test("InputLine renders wrapped text across visual rows", () => {
	const screen = new Screen(60, 20);
	const input = new InputLine();
	input.value = "hello world foo bar";
	input.cursorPos = input.value.length;
	input.render(screen, WIN, true);
	// Wrap at width 8: "hello " / "world " / "foo bar". Cursor on row 2,
	// innerH 2 -> auto-scroll to scrollRow 1, so rows 1-2 are visible.

	const rowChars = (y: number, n: number): string => {
		let s = "";
		for (let x = INNER_X + 2; x < INNER_X + 2 + n; x++) s += screen.getCell(x, y)?.ch ?? "";
		return s;
	};

	// Continuation rows are indented with two spaces (no "> " prompt)
	assert.equal(screen.getCell(INNER_X, INNER_Y)?.ch, " ");
	assert.equal(screen.getCell(INNER_X + 1, INNER_Y)?.ch, " ");
	assert.equal(rowChars(INNER_Y, 8), "world" + "   ");
	assert.equal(rowChars(INNER_Y + 1, 8), "foo bar ");

	// After shrinking the message, the first row shows the "> " prompt again
	input.value = "hi";
	input.cursorPos = 2;
	input.render(screen, WIN, true);
	assert.equal(screen.getCell(INNER_X, INNER_Y)?.ch, ">");
	assert.equal(screen.getCell(INNER_X + 1, INNER_Y)?.ch, " ");
	assert.equal(rowChars(INNER_Y, 2), "hi");
});

test("InputLine selection maps click coordinates through wrapped rows", () => {
	const input = renderedInput("hello world foo bar");
	assert.equal(input.scrollRow, 1); // rows 1-2 visible

	// Click visual row 1 ("world ") col 3 -> physical offset 6+3 = 9
	input.startSelection(INNER_X + 2 + 3, INNER_Y);
	assert.equal(input.selectionStart, 9);

	// Drag to visual row 2 ("foo bar") col 7 -> physical offset 12+7 = 19
	input.updateSelection(INNER_X + 2 + 7, INNER_Y + 1);
	assert.equal(input.selectionEnd, 19);
	assert.equal(input.getSelectedText(), "ld foo bar");

	// finishSelection returns the text and keeps the highlight (like the other
	// selection components); only clearSelection() drops it.
	assert.equal(input.finishSelection(), "ld foo bar");
	input.clearSelection();
	assert.equal(input.getSelectedText(), null);
});

// ------------------------------------------------------------ wide characters

test("InputLine wraps wide characters by display columns, not code units", () => {
	const input = new InputLine();
	// 5 CJK chars = 10 display columns -> two rows at width 8: 4 chars + 1 char
	input.value = "文".repeat(5);
	assert.deepEqual(input.getVisualRows(8), [
		{ line: 0, start: 0, end: 4 },
		{ line: 0, start: 4, end: 5 },
	]);

	// Mixed ASCII + CJK: "a文b文" = 1+2+1+2 = 6 columns; width 6 fits one row,
	// width 5 must break before the last wide char.
	input.value = "a文b文";
	assert.deepEqual(input.getVisualRows(6), [{ line: 0, start: 0, end: 4 }]);
	assert.deepEqual(input.getVisualRows(5), [
		{ line: 0, start: 0, end: 3 },
		{ line: 0, start: 3, end: 4 },
	]);
});

test("InputLine never drops characters when a wide char exceeds the wrap width", () => {
	const input = new InputLine();
	input.value = "文x";
	// Width 1: not even one column fits a wide char; the lossless guard emits
	// one char per row instead of looping forever or dropping text.
	assert.deepEqual(input.getVisualRows(1), [
		{ line: 0, start: 0, end: 1 },
		{ line: 0, start: 1, end: 2 },
	]);
});

test("InputLine keeps wide input text inside the input window", () => {
	const screen = new Screen(60, 20);
	const input = new InputLine();
	input.value = "abc文def"; // 8 display columns -> fits one text row
	input.cursorPos = input.value.length;
	input.render(screen, WIN, true);

	// Rendered glyphs sit at display-column offsets, not code-unit offsets:
	// '文' occupies textX+3 (two columns), so the next ASCII glyph lands at
	// textX+5, not textX+4. (Its second column is owned by the wide glyph -
	// filled with a continuation marker once the screen.ts wide-char work is
	// merged - so we assert the written glyph positions, not the hole.)
	assert.equal(screen.getCell(INNER_X + 2 + 3, INNER_Y)?.ch, "文");
	assert.equal(screen.getCell(INNER_X + 2 + 5, INNER_Y)?.ch, "d");
	assert.equal(screen.getCell(INNER_X + 2 + 6, INNER_Y)?.ch, "e");
	assert.equal(screen.getCell(INNER_X + 2 + 7, INNER_Y)?.ch, "f");

	// Nothing outside the window rect may be written - in particular the
	// Files-pane columns to the left of the input window must stay clean.
	for (let y = 0; y < 20; y++) {
		for (let x = 0; x < 60; x++) {
			if (x >= WIN.x && x < WIN.x + WIN.w && y >= WIN.y && y < WIN.y + WIN.h) continue;
			assert.equal(screen.getCell(x, y)?.ch, " ", `cell outside input window (${x},${y}) was overwritten`);
		}
	}
});
