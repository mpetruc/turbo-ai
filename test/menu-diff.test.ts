import { test } from "node:test";
import assert from "node:assert/strict";
import { MenuState, menuWidth } from "../src/ui/menu.js";
import { Screen } from "../src/ui/screen.js";
import { MAIN_MENUS, MenuBar } from "../src/ui/menu-bar.js";
import { DiffViewer, parseUnifiedDiff } from "../src/ui/diff-viewer.js";
import { AgentPanel } from "../src/ui/agent-panel.js";
import { InputLine } from "../src/ui/input-line.js";
import { TextPopup } from "../src/ui/text-popup.js";
import { copyToClipboard } from "../src/commands/commands.js";
import { getKeyBarSlotAtX } from "../src/ui/status-bar.js";

function sampleMenu() {
	return {
		title: "File",
		items: [
			{ label: "One", action: "one" },
			{ separator: true },
			{ label: "Two", action: "two" },
			{ label: "Three", action: "three" },
		],
	};
}

test("MenuState navigation wraps and skips separators", () => {
	const st = new MenuState(sampleMenu());
	st.selectFirst();
	assert.equal(st.current()?.label, "One");
	st.move(-1); // wraps to last
	assert.equal(st.current()?.label, "Three");
	st.move(1); // back to first
	assert.equal(st.current()?.label, "One");
	st.move(1); // skips separator
	assert.equal(st.current()?.label, "Two");
});

test("All main menus have actions on every selectable item", () => {
	for (const menu of MAIN_MENUS) {
		assert.ok(menu.items.length > 0, `${menu.title} is empty`);
		for (const item of menu.items) {
			if (!item.separator) assert.ok(item.action, `item in ${menu.title} missing action`);
		}
		assert.ok(menuWidth(menu) >= 20);
	}
});

test("parseUnifiedDiff classifies +/- lines", () => {
	const diff = [
		"diff --git a/src/auth.ts b/src/auth.ts",
		"index abc..def 100644",
		"--- a/src/auth.ts",
		"+++ b/src/auth.ts",
		"@@ -1,2 +1,2 @@",
		"-const token = getToken();",
		"+const token = await getToken();",
		" context line",
	].join("\n");
	const lines = parseUnifiedDiff(diff);
	const kinds = lines.map((l) => l.kind);
	assert.ok(kinds.includes("hunk"));
	assert.ok(kinds.includes("minus"));
	assert.ok(kinds.includes("plus"));
	assert.ok(!lines.some((l) => l.text.includes("diff --git")));
});

test("MenuState findByMnemonic finds items by mnemonic letter", () => {
	const fileMenu = MAIN_MENUS.find((m) => m.title === "File");
	assert.ok(fileMenu);
	const st = new MenuState(fileMenu);
	const exitIdx = st.findByMnemonic("x");
	assert.ok(exitIdx !== null);
	assert.equal(fileMenu.items[exitIdx]?.action, "app.exit");
});

test("MenuBar dynamically appends up to 9 recent sessions with numbered mnemonics", () => {
	const menuBar = new MenuBar();
	const sessions = ["NONAME00.PAS", "AUTH_MODULE.PAS", "PARSER.PAS", "DOCS.md"];
	menuBar.setRecentSessions(sessions);

	const fileMenu = menuBar.getMenu(0);
	assert.ok(fileMenu);
	
	const recentItems = fileMenu.items.filter((it) => it.action?.startsWith("file.recent:"));
	assert.equal(recentItems.length, 4);
	assert.equal(recentItems[0]?.label, "1. NONAME00.PAS");
	assert.equal(recentItems[0]?.mnemonic, "1");
	assert.equal(recentItems[0]?.action, "file.recent:NONAME00.PAS");
	assert.equal(recentItems[1]?.label, "2. AUTH_MODULE.PAS");
	assert.equal(recentItems[1]?.mnemonic, "2");
	assert.equal(recentItems[1]?.action, "file.recent:AUTH_MODULE.PAS");

	const st = new MenuState(fileMenu);
	const idx1 = st.findByMnemonic("1");
	assert.ok(idx1 !== null);
	assert.equal(fileMenu.items[idx1]?.action, "file.recent:NONAME00.PAS");

	const idx2 = st.findByMnemonic("2");
	assert.ok(idx2 !== null);
	assert.equal(fileMenu.items[idx2]?.action, "file.recent:AUTH_MODULE.PAS");
});

test("MAIN_MENUS has 10 menus with unique mnemonics and valid actions", () => {
	assert.equal(MAIN_MENUS.length, 10);
	const topMnemonics = new Set<string>();
	for (const menu of MAIN_MENUS) {
		const mnem = (menu.mnemonic ?? menu.title.charAt(0)).toLowerCase();
		assert.ok(!topMnemonics.has(mnem), `Duplicate top mnemonic: ${mnem}`);
		topMnemonics.add(mnem);

		const itemMnemonics = new Set<string>();
		for (const item of menu.items) {
			if (item.separator) continue;
			assert.ok(item.action, `Item ${item.label} in ${menu.title} missing action`);
			if (item.mnemonic) {
				const im = item.mnemonic.toLowerCase();
				assert.ok(!itemMnemonics.has(im), `Duplicate item mnemonic ${im} in ${menu.title}`);
				itemMnemonics.add(im);
			}
		}
	}
});

test("AgentPanel mouse text selection extracts exact single & multi-line text", () => {
	const panel = new AgentPanel();
	panel.addUserMessage("Hello world from Turbo Pascal!");
	panel.addEntry({ kind: "agent", text: "Line 1 of answer\nLine 2 of answer" });

	panel.startSelection(1, 2);
	panel.updateSelection(1, 12);
	const text = panel.finishSelection();
	assert.ok(text);
	assert.equal(text, "Hello world");

	panel.clearSelection();
	assert.equal(panel.getSelectedText(), null);
});

test("InputLine mouse text selection extracts substring", () => {
	const input = new InputLine();
	input.value = "refactor authentication module";
	input.selectionStart = 9;
	input.selectionEnd = 23;
	assert.equal(input.getSelectedText(), "authentication");

	input.clearSelection();
	assert.equal(input.getSelectedText(), null);
});

test("InputLine multi-line navigation and adaptive height", () => {
	const input = new InputLine();
	input.insert("line 1\nline 2\nline 3");

	assert.equal(input.getLines().length, 3);
	assert.equal(input.getRequiredHeight(24), 5); // 3 lines + 2 border = 5

	// Navigation
	input.home();
	const c1 = input.getCursorCoord();
	assert.equal(c1.line, 2);
	assert.equal(c1.col, 0);

	assert.equal(input.up(), true);
	const c2 = input.getCursorCoord();
	assert.equal(c2.line, 1);

	assert.equal(input.up(), true);
	const c3 = input.getCursorCoord();
	assert.equal(c3.line, 0);

	assert.equal(input.up(), false); // top line reached
});

test("TextPopup mouse text selection extracts lines and parts", () => {
	const popup = new TextPopup(80, 24, "Preview", [
		"First line of text",
		"Second line of text",
		"Third line of text",
	]);

	popup.startSelection(0, 6);
	popup.updateSelection(1, 10);
	const text = popup.finishSelection();
	assert.ok(text);
	assert.ok(text.includes("line of text"));

	popup.clearSelection();
	assert.equal(popup.getSelectedText(), null);
});

test("DiffViewer mouse text selection extracts diff lines", () => {
	const diff = parseUnifiedDiff([
		"--- a/file.ts",
		"+++ b/file.ts",
		"@@ -1,1 +1,1 @@",
		"-old code line",
		"+new code line",
	].join("\n"));

	const viewer = new DiffViewer(80, 24, "Diff");
	viewer.setDiff(diff);

	viewer.startSelection(1, 0);
	viewer.updateSelection(1, 14);
	const text = viewer.finishSelection();
	assert.ok(text);
	assert.ok(text.includes("old code"));
});

test("copyToClipboard handles empty and non-empty strings safely", () => {
	assert.equal(copyToClipboard(""), false);
	assert.equal(copyToClipboard("Test copy string"), true);
});

test("InputLine renders frame title with model, effort, and plan/build mode", () => {
	const screen = new Screen(100, 24);
	const input = new InputLine();
	const rect = { x: 0, y: 15, w: 100, h: 5 };

	// 1. With model, effort, and BUILD mode
	input.render(screen, rect, true, "anthropic/claude-3-7-sonnet", "high", false);
	let titleRowText = "";
	for (let x = 0; x < 100; x++) {
		titleRowText += screen.getCell(x, 15)?.ch ?? "";
	}
	assert.ok(titleRowText.includes("claude-3-7-sonnet"));
	assert.ok(titleRowText.includes("[high]"));
	assert.ok(titleRowText.includes("[BUILD]"));

	// 2. With PLAN mode and no effort
	input.render(screen, rect, false, "deepseek/deepseek-r1", null, true);
	titleRowText = "";
	for (let x = 0; x < 100; x++) {
		titleRowText += screen.getCell(x, 15)?.ch ?? "";
	}
	assert.ok(titleRowText.includes("deepseek-r1"));
	assert.ok(!titleRowText.includes("[high]"));
	assert.ok(titleRowText.includes("[PLAN]"));
});

test("getKeyBarSlotAtX maps exact character columns to F1-F10 slots", () => {
	const cols = 120;
	// F1 Help is at x=1..7 -> slot 0
	assert.equal(getKeyBarSlotAtX(1, cols), 0);
	assert.equal(getKeyBarSlotAtX(5, cols), 0);

	// F2 Save is at x=11..17 -> slot 1
	assert.equal(getKeyBarSlotAtX(11, cols), 1);
	assert.equal(getKeyBarSlotAtX(15, cols), 1);

	// F3 Open is at x=21..27 -> slot 2
	assert.equal(getKeyBarSlotAtX(21, cols), 2);
	assert.equal(getKeyBarSlotAtX(25, cols), 2);

	// F4 Model is at x=31..38 -> slot 3
	assert.equal(getKeyBarSlotAtX(31, cols), 3);
	assert.equal(getKeyBarSlotAtX(36, cols), 3);

	// F5 Effort is at x=42..50 -> slot 4
	assert.equal(getKeyBarSlotAtX(42, cols), 4);
	assert.equal(getKeyBarSlotAtX(48, cols), 4);

	// F6 Mode is at x=54..60 -> slot 5
	assert.equal(getKeyBarSlotAtX(54, cols), 5);
	assert.equal(getKeyBarSlotAtX(58, cols), 5);

	// F7 Diff is at x=64..70 -> slot 6
	assert.equal(getKeyBarSlotAtX(64, cols), 6);
	assert.equal(getKeyBarSlotAtX(68, cols), 6);

	// F8 Test is at x=74..80 -> slot 7
	assert.equal(getKeyBarSlotAtX(74, cols), 7);
	assert.equal(getKeyBarSlotAtX(78, cols), 7);

	// F9 Build is at x=84..91 -> slot 8
	assert.equal(getKeyBarSlotAtX(84, cols), 8);
	assert.equal(getKeyBarSlotAtX(89, cols), 8);

	// F10 Menu is at x=95..102 -> slot 9
	assert.equal(getKeyBarSlotAtX(95, cols), 9);
	assert.equal(getKeyBarSlotAtX(100, cols), 9);

	// Far right outside key bar items -> null
	assert.equal(getKeyBarSlotAtX(115, cols), null);

	// When hint is active: F1 Help only
	assert.equal(getKeyBarSlotAtX(3, cols, true, false), 0);
	assert.equal(getKeyBarSlotAtX(35, cols, true, false), null);

	// When flash message is active: no slots
	assert.equal(getKeyBarSlotAtX(3, cols, false, true), null);
});
