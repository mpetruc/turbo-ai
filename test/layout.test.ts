import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLayout, centerRect, formatTokens, inner, minSize } from "../src/utils/layout.js";

test("computeLayout produces non-overlapping panes at 120x40", () => {
	const l = computeLayout(120, 40);
	assert.ok(l);
	assert.equal(l.menuBar.h, 1);
	assert.equal(l.keyBar.y, 39);
	assert.ok(l.projectPane.w >= 20 && l.projectPane.w <= 38);
	assert.equal(l.projectPane.w + l.agentPane.w, 120);
	assert.equal(l.agentPane.x, l.projectPane.w);
});

test("computeLayout stays usable below 120x40", () => {
	const l = computeLayout(80, 24);
	assert.ok(l);
	assert.equal(l.inputLine.y + l.inputLine.h, l.keyBar.y);
});

test("computeLayout rejects tiny terminals", () => {
	assert.equal(computeLayout(50, 20), null);
	assert.equal(computeLayout(120, 10), null);
	assert.ok(minSize().cols === 60);
});

test("centerRect clamps to terminal bounds", () => {
	const r = centerRect(80, 24, 100, 30);
	assert.ok(r.x >= 0 && r.y >= 0);
	assert.ok(r.w <= 80 && r.h <= 24);
});

test("inner shrinks by frame", () => {
	const i = inner({ x: 0, y: 0, w: 10, h: 5 });
	assert.deepEqual(i, { x: 1, y: 1, w: 8, h: 3 });
});

test("formatTokens formats like a TP status bar", () => {
	assert.equal(formatTokens(18400), "18.4k tokens");
	assert.equal(formatTokens(950), "950 tokens");
	assert.equal(formatTokens(null), null);
});

test("computeLayout adapts dynamically to inputHeight and clamps to half screen", () => {
	// Standard 1-line prompt
	const l1 = computeLayout(80, 24, 3);
	assert.ok(l1);
	assert.equal(l1.inputLine.h, 3);
	assert.equal(l1.agentPane.h, 22 - 3);

	// 5-line prompt
	const l5 = computeLayout(80, 24, 7);
	assert.ok(l5);
	assert.equal(l5.inputLine.h, 7);
	assert.equal(l5.agentPane.h, 22 - 7);
	assert.equal(l5.inputLine.y + l5.inputLine.h, l5.keyBar.y);

	// Multi-line prompt exceeding half screen (24 / 2 = 12)
	const lMax = computeLayout(80, 24, 20);
	assert.ok(lMax);
	assert.equal(lMax.inputLine.h, 12); // clamped to half screen (24 / 2)
	assert.equal(lMax.agentPane.h, 22 - 12);
	assert.equal(lMax.inputLine.y + lMax.inputLine.h, lMax.keyBar.y);
});
