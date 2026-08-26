import { packAttr, THEME, type ColorAttr } from "../theme/turbo-pascal.js";
import { centerRect, inner, type Rect } from "../utils/layout.js";
import type { Screen } from "./screen.js";

export interface DiffLine {
	kind: "minus" | "plus" | "hunk" | "context" | "info";
	text: string;
}

/** Parse unified diff output (git diff) into display lines. Pure function. */
export function parseUnifiedDiff(diffText: string): DiffLine[] {
	const out: DiffLine[] = [];
	for (const line of diffText.split("\n")) {
		if (line.startsWith("diff --git")) continue;
		if (line.startsWith("index ")) continue;
		if (line.startsWith("+++") || line.startsWith("---")) continue;
		if (line.startsWith("@@")) out.push({ kind: "hunk", text: line });
		else if (line.startsWith("+")) out.push({ kind: "plus", text: `+ ${line.slice(1)}` });
		else if (line.startsWith("-")) out.push({ kind: "minus", text: `- ${line.slice(1)}` });
		else if (line.startsWith("diff") || /^\s{2,}\S/.test(line)) out.push({ kind: "info", text: line.trim() });
		else if (line.length > 0) out.push({ kind: "context", text: `  ${line}` });
	}
	return out;
}

/** Scrollable DOS-style diff viewer over parsed unified-diff lines. */
export class DiffViewer {
	private lines: DiffLine[] = [];
	private scroll = 0;
	private normalRect: Rect;
	private zoomed = false;
	rect: Rect;

	constructor(cols: number, rows: number, readonly title: string) {
		const w = Math.min(cols - 4, 100);
		const h = Math.min(rows - 4, Math.max(10, Math.floor(rows * 0.85)));
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

	setDiff(lines: DiffLine[]): void {
		this.lines = lines;
		this.scroll = 0;
	}

	scrollBy(delta: number): void {
		const max = Math.max(0, this.lines.length - inner(this.rect).h);
		this.scroll = Math.min(max, Math.max(0, this.scroll + delta));
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
			const dl = this.lines[l];
			if (!dl) continue;
			const fullText = dl.text;
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
		const frameAttr = packAttr(THEME.activeFrame);
		const titleAttr = packAttr(THEME.panelTitleActive);
		const shadowAttr = packAttr(THEME.shadow);
		const bgAttr = packAttr({ fg: THEME.agentText.fg, bg: THEME.desktop.bg });
		const selAttr = packAttr(THEME.selection);

		screen.shadow(this.rect.x, this.rect.y, this.rect.w, this.rect.h, shadowAttr);
		screen.fill(this.rect.x, this.rect.y, this.rect.w, this.rect.h, bgAttr);
		screen.boxDouble(this.rect.x, this.rect.y, this.rect.w, this.rect.h, frameAttr, this.title.toUpperCase(), titleAttr, {
			closeBox: true,
			zoomBox: true,
			zoomed: this.zoomed,
		});

		const a = inner(this.rect);
		const sel = this.getNormalizedSelection();

		if (this.lines.length === 0) {
			screen.text(a.x + 2, a.y + 2, "(no changes detected)", packAttr(THEME.dimText));
		} else {
			for (let row = 0; row < a.h; row++) {
				const lineIdx = this.scroll + row;
				const dl = this.lines[lineIdx];
				if (!dl) break;
				let theme: ColorAttr = THEME.agentText;
				if (dl.kind === "plus") theme = THEME.diffPlus;
				else if (dl.kind === "minus") theme = THEME.diffMinus;
				else if (dl.kind === "hunk") theme = THEME.diffHunk;
				else if (dl.kind === "info") theme = THEME.dimText;
				const normalAttr = packAttr({ fg: theme.fg, bg: THEME.desktop.bg });

				for (let ci = 0; ci < a.w; ci++) {
					if (ci >= dl.text.length) break;
					const ch = dl.text[ci]!;
					const isSel = sel ? (
						(lineIdx > sel.startLine && lineIdx < sel.endLine) ||
						(lineIdx === sel.startLine && lineIdx === sel.endLine && ci >= sel.startCol && ci <= sel.endCol) ||
						(lineIdx === sel.startLine && lineIdx < sel.endLine && ci >= sel.startCol) ||
						(lineIdx === sel.endLine && lineIdx > sel.startLine && ci <= sel.endCol)
					) : false;
					screen.setCell(a.x + ci, a.y + row, ch, isSel ? selAttr : normalAttr);
				}
			}

			// Scrollbar along right edge
			if (this.rect.h > 4) {
				screen.scrollbarV(
					this.rect.x + this.rect.w - 1,
					this.rect.y + 1,
					this.rect.h - 2,
					this.lines.length,
					a.h,
					this.scroll,
					packAttr(THEME.windowScrollTrack),
					packAttr(THEME.windowScrollThumb),
					packAttr(THEME.windowScrollArrow),
				);
			}
		}

		const hint = ` Lines ${this.scroll + 1}-${Math.min(this.lines.length, this.scroll + a.h)} of ${this.lines.length} \u2502 Up/Down PgUp/PgDn Esc `;
		if (this.rect.w >= hint.length + 4) {
			screen.textClipped(this.rect.x + 2, this.rect.y + this.rect.h - 1, hint, this.rect.w - 4, packAttr(THEME.windowLineCounter));
		}
	}
}
