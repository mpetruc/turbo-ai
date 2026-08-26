import { test } from "node:test";
import assert from "node:assert/strict";
import { mapKey } from "../src/utils/keys.js";
import { parseSgrMouse, type KeyEvent } from "../src/utils/terminal.js";

function key(partial: Partial<KeyEvent>): KeyEvent {
	return { name: "", ctrl: false, alt: false, shift: false, sequence: "", ...partial };
}

test("F1-F10 map to their actions", () => {
	const expected = ["help", "saveSession", "openSession", "model", "effort", "mode", "diff", "tests", "build", "menu"];
	expected.forEach((kind, i) => {
		assert.equal(mapKey(key({ name: `f${i + 1}` })).kind, kind);
	});
});

test("Ctrl shortcuts", () => {
	assert.equal(mapKey(key({ name: "s", ctrl: true })).kind, "save");
	assert.equal(mapKey(key({ name: "f", ctrl: true })).kind, "find");
	assert.equal(mapKey(key({ name: "l", ctrl: true })).kind, "clearView");
	assert.equal(mapKey(key({ name: "c", ctrl: true })).kind, "cancel");
});

test("Alt+X exits", () => {
	assert.equal(mapKey(key({ name: "x", alt: true })).kind, "exit");
});

test("Alt menu shortcuts", () => {
	assert.deepEqual(mapKey(key({ name: "f", alt: true })), { kind: "openMenu", menu: "file" });
	assert.deepEqual(mapKey(key({ name: "e", alt: true })), { kind: "openMenu", menu: "edit" });
	assert.deepEqual(mapKey(key({ name: "s", alt: true })), { kind: "openMenu", menu: "search" });
	assert.deepEqual(mapKey(key({ name: "r", alt: true })), { kind: "openMenu", menu: "run" });
	assert.deepEqual(mapKey(key({ name: "a", alt: true })), { kind: "openMenu", menu: "agent" });
	assert.deepEqual(mapKey(key({ name: "g", alt: true })), { kind: "openMenu", menu: "git" });
	assert.deepEqual(mapKey(key({ name: "t", alt: true })), { kind: "openMenu", menu: "tools" });
	assert.deepEqual(mapKey(key({ name: "w", alt: true })), { kind: "openMenu", menu: "window" });
	assert.deepEqual(mapKey(key({ name: "h", alt: true })), { kind: "openMenu", menu: "help" });
});

test("navigation and editing keys", () => {
	assert.equal(mapKey(key({ name: "up" })).kind, "up");
	assert.equal(mapKey(key({ name: "down" })).kind, "down");
	assert.equal(mapKey(key({ name: "left" })).kind, "left");
	assert.equal(mapKey(key({ name: "right" })).kind, "right");
	assert.equal(mapKey(key({ name: "enter" })).kind, "enter");
	assert.equal(mapKey(key({ name: "return" })).kind, "enter");
	assert.equal(mapKey(key({ name: "escape" })).kind, "esc");
	assert.equal(mapKey(key({ name: "backspace" })).kind, "backspace");
	assert.equal(mapKey(key({ name: "delete" })).kind, "delete");
	assert.equal(mapKey(key({ name: "pageup" })).kind, "pageup");
	assert.equal(mapKey(key({ name: "pagedown" })).kind, "pagedown");
	assert.equal(mapKey(key({ name: "home" })).kind, "home");
	assert.equal(mapKey(key({ name: "end" })).kind, "end");
	assert.equal(mapKey(key({ name: "tab" })).kind, "tab");
});

test("printable characters pass through", () => {
	const a = mapKey(key({ sequence: "a" }));
	assert.deepEqual(a, { kind: "char", ch: "a" });
	assert.deepEqual(mapKey(key({ sequence: "?" })), { kind: "char", ch: "?" });
});

test("control characters are ignored as chars", () => {
	assert.equal(mapKey(key({ sequence: "\t", name: "tab" })).kind, "tab");
	assert.equal(mapKey(key({ sequence: "\x01", ctrl: true })).kind, "ignored");
});

test("parseSgrMouse decodes clicks, drags, and wheel events", () => {
	// Left click down at col 15, row 5 (1-based -> 0-based 14, 4)
	assert.deepEqual(parseSgrMouse(0, 15, 5, "M"), {
		button: "left",
		action: "down",
		x: 14,
		y: 4,
		shift: false,
		ctrl: false,
		alt: false,
	});

	// Left click up
	assert.deepEqual(parseSgrMouse(0, 15, 5, "m"), {
		button: "left",
		action: "up",
		x: 14,
		y: 4,
		shift: false,
		ctrl: false,
		alt: false,
	});

	// Wheel Up at col 20, row 10
	assert.deepEqual(parseSgrMouse(64, 20, 10, "M"), {
		button: "wheelUp",
		action: "down",
		x: 19,
		y: 9,
		shift: false,
		ctrl: false,
		alt: false,
	});

	// Wheel Down at col 20, row 10
	assert.deepEqual(parseSgrMouse(65, 20, 10, "M"), {
		button: "wheelDown",
		action: "down",
		x: 19,
		y: 9,
		shift: false,
		ctrl: false,
		alt: false,
	});
});
