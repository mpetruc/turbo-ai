import { DosColor, packAttr, THEME } from "../theme/turbo-pascal.js";
import type { Screen } from "./screen.js";

export interface StatusBarFields {
	model: string | null;
	contextTokens: number | null;
	state: "IDLE" | "BUILD" | "RUN" | "PLAN";
	branch: string | null;
	added: number | null;
	removed: number | null;
	elapsedMs: number | null;
	message: string | null; // transient hint overrides the bar
	hint?: string | null; // contextual menu / control hint
}

export function formatStatusBar(f: StatusBarFields): Array<{ text: string; sep: boolean }> {
	const parts: string[] = [];
	if (f.state && f.state !== "IDLE") parts.push(f.state);
	if (f.branch) {
		const b = f.branch.replace(/^heads\//, "");
		if (f.added !== null && f.removed !== null) {
			parts.push(`${b} (+${f.added} -${f.removed})`);
		} else {
			parts.push(b);
		}
	} else if (f.added !== null && f.removed !== null) {
		parts.push(`+${f.added} -${f.removed}`);
	}
	if (f.elapsedMs !== null) parts.push(`${(f.elapsedMs / 1000).toFixed(1)}s`);
	return parts.map((p) => ({ text: p, sep: true }));
}

export function renderStatusBar(
	screen: Screen,
	y: number,
	cols: number,
	fields: StatusBarFields,
): void {
	const attr = packAttr(THEME.statusBar);
	const divAttr = packAttr(THEME.keyBarDivider);
	screen.fill(0, y, cols, 1, attr);

	let x = 1;
	// If a transient flash message exists, display it with priority
	if (fields.message) {
		screen.textClipped(x, y, fields.message, cols - x - 1, packAttr(THEME.panelTitleActive));
		return;
	}

	const parts = formatStatusBar(fields);
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		if (!p || x >= cols - 1) break;
		screen.text(x, y, p.text, attr);
		x += p.text.length;
		if (i < parts.length - 1 && x < cols - 3) {
			screen.text(x, y, " \u2502 ", divAttr);
			x += 3;
		}
	}
}

export const KEY_BAR_ITEMS: Array<[string, string]> = [
	["F1", "Help"],
	["F2", "Save"],
	["F3", "Open"],
	["F4", "Model"],
	["F5", "Effort"],
	["F6", "Mode"],
	["F7", "Diff"],
	["F8", "Test"],
	["F9", "Build"],
	["F10", "Menu"],
];

export interface KeyBarSlotRange {
	slot: number;
	startX: number;
	endX: number;
}

export function getKeyBarSlotRanges(cols: number, thinking = false): KeyBarSlotRange[] {
	const ranges: KeyBarSlotRange[] = [];
	let x = 1;
	const rightMargin = thinking ? 22 : 2;

	for (let i = 0; i < KEY_BAR_ITEMS.length; i++) {
		const [k, label] = KEY_BAR_ITEMS[i]!;
		const itemWidth = k.length + 1 + label.length;
		if (x + itemWidth >= cols - rightMargin) break;

		const startX = x;
		const endX = x + itemWidth;
		ranges.push({ slot: i, startX: Math.max(0, startX - 1), endX: endX + 1 });

		x += itemWidth;
		if (i < KEY_BAR_ITEMS.length - 1 && x < cols - rightMargin - 2) {
			x += 3; // " │ "
		}
	}
	return ranges;
}

export function getKeyBarSlotAtX(x: number, cols: number, hasHint = false, hasMessage = false, thinking = false): number | null {
	if (hasMessage) return null;
	if (hasHint) {
		if (x >= 0 && x <= 8) return 0; // F1 Help
		return null;
	}
	const ranges = getKeyBarSlotRanges(cols, thinking);
	for (const r of ranges) {
		if (x >= r.startX && x <= r.endX) {
			return r.slot;
		}
	}
	return null;
}

/** Single bottom line hotkey bar (Turbo Pascal 7.0 authentic style) */
export function renderKeyBar(
	screen: Screen,
	y: number,
	cols: number,
	hint: string | null = null,
	message: string | null = null,
	thinking?: { spinner: string; elapsedSec: number } | null,
): void {
	const txtAttr = packAttr(THEME.menuBar);
	const keyAttr = packAttr(THEME.menuBarMnemonic);
	const divAttr = packAttr({ fg: DosColor.DARKGRAY, bg: DosColor.LIGHTGRAY });
	const hintAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });

	screen.fill(0, y, cols, 1, txtAttr);

	let x = 1;
	// 1. When a menu is highlighted, replace the bottom key bar with: F1 Help │ <hint>
	if (hint) {
		const f1 = "F1";
		const help = " Help";
		screen.text(x, y, f1, keyAttr);
		x += f1.length;
		screen.text(x, y, help, txtAttr);
		x += help.length;
		screen.text(x, y, " \u2502 ", divAttr);
		x += 3;
		screen.textClipped(x, y, hint, cols - x - 1, hintAttr);
		return;
	}

	// 2. If a transient flash message exists, display it with priority
	if (message) {
		screen.textClipped(x, y, message, cols - x - 1, packAttr(THEME.panelTitleActive));
		return;
	}

	// 3. Normal hotkey bar
	const rightMargin = thinking ? 22 : 2;

	for (let i = 0; i < KEY_BAR_ITEMS.length; i++) {
		const item = KEY_BAR_ITEMS[i];
		if (!item) continue;
		const [k, label] = item;
		const needed = k.length + label.length + 3;
		if (x + needed >= cols - rightMargin) break;

		screen.text(x, y, k, keyAttr);
		x += k.length;
		screen.text(x, y, " " + label, txtAttr);
		x += label.length + 1;

		if (i < KEY_BAR_ITEMS.length - 1 && x < cols - rightMargin - 2) {
			screen.text(x, y, " \u2502 ", divAttr);
			x += 3;
		}
	}

	// 4. If model is thinking / streaming, show animated indicator on the right side
	if (thinking) {
		const thinkingStr = ` Thinking [ ${thinking.spinner} ] ${thinking.elapsedSec.toFixed(1)}s `;
		const tx = Math.max(x + 1, cols - thinkingStr.length);
		screen.text(tx, y, thinkingStr, packAttr(THEME.thinkingBadge));
	}
}
