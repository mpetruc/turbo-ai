import { DosColor, packAttr, THEME } from "../theme/turbo-pascal.js";
import { centerRect, inner, type Rect } from "../utils/layout.js";
import type { Screen } from "./screen.js";
import { ABOUT_TEXT } from "./help.js";

/** Generic scrollable text popup dialog (file preview, session stats, about). */
export class TextPopup {
	private scroll = 0;
	private normalRect: Rect;
	private zoomed = false;
	rect: Rect;

	constructor(cols: number, rows: number, readonly title: string, readonly lines: string[]) {
		const w = Math.min(cols - 4, 84);
		const h = Math.min(rows - 4, Math.max(8, Math.min(22, lines.length + 4)));
		this.normalRect = centerRect(cols, rows, w, h);
		this.rect = { ...this.normalRect };
	}

	toggleZoom(cols: number, rows: number): void {
		this.zoomed = !this.zoomed;
		if (this.zoomed) {
			this.rect = { x: 1, y: 1, w: Math.max(20, cols - 2), h: Math.max(10, rows - 2) };
		} else {
			this.rect = { ...this.normalRect };
		}
	}

	up(): void {
		if (this.scroll > 0) this.scroll--;
	}

	down(): void {
		const max = Math.max(0, this.lines.length - inner(this.rect).h);
		if (this.scroll < max) this.scroll++;
	}

	pageUp(): void {
		this.scroll = Math.max(0, this.scroll - 8);
	}

	pageDown(): void {
		const max = Math.max(0, this.lines.length - inner(this.rect).h);
		this.scroll = Math.min(max, this.scroll + 8);
	}

	home(): void {
		this.scroll = 0;
	}

	end(): void {
		this.scroll = Math.max(0, this.lines.length - inner(this.rect).h);
	}

	scrollToRatio(ratio: number): void {
		const max = Math.max(0, this.lines.length - inner(this.rect).h);
		this.scroll = Math.max(0, Math.min(max, Math.round(ratio * max)));
	}

	getThumbRow(trackH: number): number {
		const max = Math.max(0, this.lines.length - inner(this.rect).h);
		if (max <= 0 || trackH <= 0) return 0;
		const ratio = Math.max(0, Math.min(1, this.scroll / max));
		return Math.min(trackH - 1, Math.floor(ratio * trackH));
	}

	private selection: { startLine: number; startCol: number; endLine: number; endCol: number } | null = null;
	private selecting = false;

	startSelection(row: number, col: number): void {
		const line = this.scroll + row;
		this.selection = { startLine: line, startCol: col, endLine: line, endCol: col };
		this.selecting = true;
	}

	updateSelection(row: number, col: number): void {
		if (!this.selecting || !this.selection) return;
		this.selection.endLine = this.scroll + row;
		this.selection.endCol = col;
	}

	finishSelection(): string | null {
		this.selecting = false;
		return this.getSelectedText();
	}

	clearSelection(): void {
		this.selection = null;
		this.selecting = false;
	}

	getNormalizedSelection(): { startLine: number; startCol: number; endLine: number; endCol: number } | null {
		if (!this.selection) return null;
		const { startLine, startCol, endLine, endCol } = this.selection;
		if (startLine < endLine || (startLine === endLine && startCol <= endCol)) {
			return { startLine, startCol, endLine, endCol };
		}
		return { startLine: endLine, startCol: endCol, endLine: startLine, endCol: startCol };
	}

	getSelectedText(): string | null {
		const sel = this.getNormalizedSelection();
		if (!sel) return null;
		if (sel.startLine === sel.endLine && sel.startCol === sel.endCol) return null;

		const parts: string[] = [];
		for (let l = sel.startLine; l <= sel.endLine && l < this.lines.length; l++) {
			const fullText = this.lines[l] ?? "";
			if (sel.startLine === sel.endLine) {
				parts.push(fullText.slice(sel.startCol, sel.endCol + 1));
			} else if (l === sel.startLine) {
				parts.push(fullText.slice(sel.startCol));
			} else if (l === sel.endLine) {
				parts.push(fullText.slice(0, sel.endCol + 1));
			} else {
				parts.push(fullText);
			}
		}
		const text = parts.join("\n");
		return text.length > 0 ? text : null;
	}

	render(screen: Screen): void {
		const frameAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const bgAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
		const titleAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const shadowAttr = packAttr(THEME.shadow);
		const selAttr = packAttr(THEME.selection);
		const { x, y, w, h } = this.rect;

		screen.shadow(x, y, w, h, shadowAttr);
		screen.fill(x, y, w, h, bgAttr);
		screen.boxDouble(x, y, w, h, frameAttr, this.title, titleAttr, { closeBox: true, zoomBox: true, zoomed: this.zoomed });

		const a = inner(this.rect);
		const sel = this.getNormalizedSelection();

		for (let row = 0; row < a.h; row++) {
			const lineIdx = this.scroll + row;
			const line = this.lines[lineIdx];
			if (line === undefined) break;
			const textW = a.w - 2;
			for (let ci = 0; ci < textW; ci++) {
				const ch = ci < line.length ? line[ci]! : " ";
				const isSel = sel && ci < line.length ? (
					(lineIdx > sel.startLine && lineIdx < sel.endLine) ||
					(lineIdx === sel.startLine && lineIdx === sel.endLine && ci >= sel.startCol && ci <= sel.endCol) ||
					(lineIdx === sel.startLine && lineIdx < sel.endLine && ci >= sel.startCol) ||
					(lineIdx === sel.endLine && lineIdx > sel.startLine && ci <= sel.endCol)
				) : false;
				screen.setCell(a.x + 1 + ci, a.y + row, ch, isSel ? selAttr : bgAttr);
			}
		}

		if (h > 4 && this.lines.length > a.h) {
			screen.scrollbarV(
				x + w - 1,
				y + 1,
				h - 2,
				this.lines.length,
				a.h,
				this.scroll,
				packAttr(THEME.windowScrollTrack),
				packAttr(THEME.windowScrollThumb),
				packAttr(THEME.windowScrollArrow),
			);
		}

		const counter = ` ${this.scroll + 1}/${this.lines.length} \u2502 Esc Close `;
		if (w >= counter.length + 4) {
			screen.text(x + 2, y + h - 1, counter, packAttr(THEME.dialogFrame));
		}
	}
}

export { ABOUT_TEXT };
