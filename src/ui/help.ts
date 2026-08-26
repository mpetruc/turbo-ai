import { DosColor, packAttr, THEME } from "../theme/turbo-pascal.js";
import { centerRect, inner, type Rect } from "../utils/layout.js";
import type { Screen } from "./screen.js";

const HELP_LINES: Array<[string, string]> = [
	["F1", "Help screen & shortcuts"],
	["F2", "Save session to file"],
	["F3", "Open saved session file"],
	["F4", "Select AI model (from Pi)"],
	["F5", "Thinking effort level"],
	["F6", "Toggle PLAN / BUILD mode"],
	["F7", "Unified git diff viewer"],
	["F8", "Run tests (npm test)"],
	["F9", "Run build (npm run build)"],
	["F10", "Menu bar toggle"],
	["Tab", "Switch active window"],
	["Alt+F..H", "Direct menu shortcuts"],
	["Ctrl+F", "Find in files (filter tree)"],
	["Ctrl+L", "Clear agent message history"],
	["Ctrl+C", "Copy selection / cancel command"],
	["Alt+X", "Exit to DOS / terminal"],
	["Esc", "Close dialog / cancel / unfocus"],
];

export function helpRect(cols: number, rows: number): Rect {
	return centerRect(cols, rows, Math.min(56, cols - 4), Math.min(rows - 4, HELP_LINES.length + 5));
}

export function renderHelp(screen: Screen): void {
	const rect = helpRect(screen.width, screen.height);
	const frameAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
	const bgAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
	const titleAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
	const shadowAttr = packAttr(THEME.shadow);
	const keyAttr = packAttr(THEME.helpDialogKey);
	const descAttr = packAttr(THEME.helpDialogText);

	screen.shadow(rect.x, rect.y, rect.w, rect.h, shadowAttr);
	screen.fill(rect.x, rect.y, rect.w, rect.h, bgAttr);
	screen.boxDouble(rect.x, rect.y, rect.w, rect.h, frameAttr, "Help", titleAttr, {
		closeBox: true,
	});

	const area = inner(rect);
	let y = area.y + 1;
	for (const [key, desc] of HELP_LINES) {
		if (y > area.y + area.h - 3) break;
		screen.text(area.x + 2, y, key.padEnd(11), keyAttr);
		screen.text(area.x + 13, y, desc, descAttr);
		y++;
	}

	// Centered OK button with green fill, yellow 'K', and authentic Turbo Vision 3D half-block shadow
	const btnText = "     OK     ";
	const btnW = btnText.length;
	const btnX = rect.x + Math.floor((rect.w - btnW) / 2);
	const btnY = rect.y + rect.h - 3;
	const btnAttr = packAttr(THEME.dialogButtonActive);
	const btnOkKAttr = packAttr(THEME.dialogButtonOkK);
	const btnShadowAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });

	for (let i = 0; i < btnW; i++) {
		const ch = btnText[i]!;
		screen.setCell(btnX + i, btnY, ch, ch === "K" ? btnOkKAttr : btnAttr);
	}
	screen.setCell(btnX + btnW, btnY, "\u2584", btnShadowAttr);
	for (let cx = btnX + 1; cx <= btnX + btnW; cx++) {
		screen.setCell(cx, btnY + 1, "\u2580", btnShadowAttr);
	}
}

/**
 * Authentic Turbo Pascal 7.1 styled About Dialog matching about.jpg:
 * White double frame, centered "About" title, [■] green close box,
 * centered text lines with Turbo AI details and tribute to Turbo Pascal,
 * and a centered green "OK" button with drop shadow.
 */
export class AboutDialog {
	rect: Rect;

	constructor(cols: number, rows: number) {
		const w = Math.min(50, Math.max(38, cols - 4));
		const h = 14;
		this.rect = centerRect(cols, rows, w, h);
	}

	render(screen: Screen): void {
		const { x, y, w, h } = this.rect;
		const frameAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const bgAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
		const titleAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const shadowAttr = packAttr(THEME.shadow);

		// Drop shadow
		screen.shadow(x, y, w, h, shadowAttr);

		// Dialog body (Light Gray)
		screen.fill(x, y, w, h, bgAttr);

		// Double border frame with centered "About" and green close box [■]
		screen.boxDouble(x, y, w, h, frameAttr, "About", titleAttr, {
			closeBox: true,
		});

		// Centered text lines
		const lines = [
			"Turbo AI",
			"Version 1.01 Beta",
			"Retro DOS Frontend for Pi Agent",
			"",
			"A loving homage to",
			"Turbo Pascal 7.1",
			"Copyright (c) 1983, 1997",
			"Borland International, Inc.",
		];

		let textY = y + 2;
		for (const line of lines) {
			if (line.length > 0) {
				const tx = x + Math.floor((w - line.length) / 2);
				screen.text(tx, textY, line, bgAttr);
			}
			textY++;
		}

		// Centered OK button with green fill, yellow 'K', and authentic Turbo Vision 3D half-block shadow
		const btnText = "     OK     ";
		const btnW = btnText.length;
		const btnX = x + Math.floor((w - btnW) / 2);
		const btnY = y + h - 3;
		const btnAttr = packAttr(THEME.dialogButtonActive);
		const btnOkKAttr = packAttr(THEME.dialogButtonOkK);
		const btnShadowAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });

		// Button body with yellow 'K'
		for (let i = 0; i < btnW; i++) {
			const ch = btnText[i]!;
			screen.setCell(btnX + i, btnY, ch, ch === "K" ? btnOkKAttr : btnAttr);
		}

		// Right-side shadow on btnY (lower half block)
		screen.setCell(btnX + btnW, btnY, "\u2584", btnShadowAttr);

		// Bottom shadow on btnY + 1 (upper half block touching button bottom)
		for (let cx = btnX + 1; cx <= btnX + btnW; cx++) {
			screen.setCell(cx, btnY + 1, "\u2580", btnShadowAttr);
		}
	}
}

export const ABOUT_TEXT = [
	"Turbo AI",
	"Version 1.01 Beta",
	"Retro DOS Frontend for Pi Agent",
	"",
	"A loving homage to",
	"Turbo Pascal 7.1",
	"Copyright (c) 1983, 1997",
	"Borland International, Inc.",
];
