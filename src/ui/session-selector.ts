import { DosColor, packAttr, THEME } from "../theme/turbo-pascal.js";
import { centerRect, inner, type Rect } from "../utils/layout.js";
import type { SessionSummary } from "../commands/commands.js";
import type { Screen } from "./screen.js";

/**
 * Authentic Turbo Pascal 7.0 modal dialog for selecting and resuming a previous session.
 */
export class SessionSelector {
	private items: SessionSummary[] = [];
	index = 0;
	rect: Rect;
	title = "Resume Session";
	private message: string | null = null;

	constructor(cols: number, rows: number) {
		const w = Math.min(76, Math.max(50, cols - 4));
		const h = Math.min(18, Math.max(12, rows - 4));
		this.rect = centerRect(cols, rows, w, h);
	}

	setSessions(sessions: SessionSummary[]): void {
		this.items = sessions;
		this.index = 0;
		this.message = null;
	}

	setLoading(): void {
		this.items = [];
		this.message = "Searching project sessions...";
	}

	setError(message: string): void {
		this.items = [];
		this.message = message;
	}

	get sessions(): SessionSummary[] {
		return this.items;
	}

	current(): SessionSummary | null {
		return this.items[this.index] ?? null;
	}

	up(): void {
		if (this.index > 0) this.index--;
	}

	down(): void {
		if (this.index < this.items.length - 1) this.index++;
	}

	pageUp(): void {
		this.index = Math.max(0, this.index - 6);
	}

	pageDown(): void {
		this.index = Math.min(Math.max(0, this.items.length - 1), this.index + 6);
	}

	home(): void {
		this.index = 0;
	}

	end(): void {
		this.index = Math.max(0, this.items.length - 1);
	}

	findByDigit(ch: string): number | null {
		const n = parseInt(ch, 10);
		if (!isNaN(n) && n >= 1 && n <= Math.min(9, this.items.length)) {
			this.index = n - 1;
			return this.index;
		}
		return null;
	}

	scrollToRatio(ratio: number): void {
		if (this.items.length === 0) return;
		this.index = Math.max(0, Math.min(this.items.length - 1, Math.round(ratio * (this.items.length - 1))));
	}

	getThumbRow(trackH: number): number {
		if (this.items.length <= 1 || trackH <= 0) return 0;
		const ratio = Math.max(0, Math.min(1, this.index / (this.items.length - 1)));
		return Math.min(trackH - 1, Math.floor(ratio * trackH));
	}

	render(screen: Screen): void {
		const frameAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const titleAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const bgAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
		const itemAttr = packAttr(THEME.menuItem);
		const numAttr = packAttr(THEME.menuBarMnemonic);
		const highlightAttr = packAttr(THEME.menuHighlight);
		const highlightNumAttr = packAttr(THEME.menuHighlightMnemonic);
		const dimAttr = packAttr({ fg: DosColor.DARKGRAY, bg: DosColor.LIGHTGRAY });
		const highlightDimAttr = packAttr({ fg: DosColor.DARKGRAY, bg: DosColor.GREEN });

		// Drop shadow
		screen.shadow(this.rect.x, this.rect.y, this.rect.w, this.rect.h, packAttr(THEME.shadow));

		// Dialog body (Light Gray)
		screen.fill(this.rect.x, this.rect.y, this.rect.w, this.rect.h, bgAttr);

		// Double border frame
		screen.boxDouble(this.rect.x, this.rect.y, this.rect.w, this.rect.h, frameAttr, this.title, titleAttr, {
			closeBox: true,
		});

		const a = inner(this.rect);
		if (a.w <= 0 || a.h <= 0) return;

		// Header row
		const headerDate = "Date / Time";
		const headerPrompt = "First Prompt / Task Preview";
		screen.text(a.x + 4, a.y, headerDate, dimAttr);
		screen.text(a.x + 22, a.y, headerPrompt, dimAttr);

		// Separator line
		for (let cx = a.x; cx < a.x + a.w; cx++) {
			screen.setCell(cx, a.y + 1, "\u2500", dimAttr);
		}

		const listY = a.y + 2;
		const visibleRows = Math.max(1, a.h - 3);

		if (this.items.length === 0) {
			const message = this.message ?? "No previous sessions found for this project";
			screen.textClipped(a.x + 2, listY + 1, `(${message})`, Math.max(0, a.w - 4), dimAttr);
			return;
		}

		// Scroll window
		let startIdx = 0;
		if (this.index >= visibleRows) {
			startIdx = this.index - visibleRows + 1;
		}
		const endIdx = Math.min(this.items.length, startIdx + visibleRows);

		for (let i = startIdx; i < endIdx; i++) {
			const row = listY + (i - startIdx);
			const isSel = i === this.index;
			const s = this.items[i]!;

			const curAttr = isSel ? highlightAttr : itemAttr;
			const curNumAttr = isSel ? highlightNumAttr : numAttr;
			const curDimAttr = isSel ? highlightDimAttr : dimAttr;

			screen.fill(a.x, row, a.w - 1, 1, curAttr);

			// Number shortcut (1..9)
			const numPrefix = i < 9 ? `${i + 1}. ` : "   ";
			screen.text(a.x + 1, row, numPrefix, curNumAttr);

			// Date
			const dateStr = s.date.slice(5); // e.g. "08-26 14:35"
			screen.text(a.x + 4, row, dateStr.padEnd(16), curDimAttr);

			// First prompt preview
			const maxPromptW = Math.max(10, a.w - 23);
			const promptPreview = s.firstPrompt.slice(0, maxPromptW);
			screen.text(a.x + 22, row, promptPreview, curAttr);
		}

		// Vertical scrollbar on right side
		if (this.items.length > visibleRows) {
			const scrollX = a.x + a.w - 1;
			const trackH = visibleRows;
			const thumbRow = this.getThumbRow(trackH);

			screen.setCell(scrollX, listY - 1, "\u25b2", packAttr(THEME.windowScrollArrow));
			for (let r = 0; r < trackH; r++) {
				const ch = r === thumbRow ? "\u2588" : "\u2591";
				const attr = packAttr(r === thumbRow ? THEME.windowScrollThumb : THEME.windowScrollTrack);
				screen.setCell(scrollX, listY + r, ch, attr);
			}
			screen.setCell(scrollX, listY + trackH, "\u25bc", packAttr(THEME.windowScrollArrow));
		}

		// Bottom action hint
		const hint = " [Enter] Resume  [Esc] Cancel ";
		const hintX = this.rect.x + Math.floor((this.rect.w - hint.length) / 2);
		screen.text(hintX, this.rect.y + this.rect.h - 1, hint, packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY }));
	}
}
