import { packAttr, THEME } from "../theme/turbo-pascal.js";
import type { Rect } from "../utils/layout.js";
import type { Screen } from "./screen.js";

const MAX_TEXT_ROWS = 8;

/**
 * Turbo Pascal style message input prompt window with adaptive multi-line height,
 * soft word-wrap, vertical and horizontal cursor navigation, editing, scrolling,
 * history, and mouse selection.
 */
export class InputLine {
	value = "";
	cursorPos = 0;
	scrollRow = 0;
	private history: string[] = [];
	private historyPos: number | null = null;
	private savedCurrent = "";

	selectionStart: number | null = null;
	selectionEnd: number | null = null;
	private selecting = false;
	private lastInnerX = 0;
	private lastInnerY = 0;
	private lastInnerW = 0;
	private lastInnerH = 1;
	private lastTextW = 0;
	private manualScroll = false;

	getLines(): string[] {
		return this.value.split("\n");
	}

	getRequiredHeight(maxTerminalRows: number, textWidth?: number): number {
		const visualRows = textWidth !== undefined ? this.getVisualRows(textWidth).length : this.getLines().length;
		const maxOuter = Math.max(3, Math.floor(maxTerminalRows / 2));
		return Math.min(maxOuter, Math.max(3, Math.min(MAX_TEXT_ROWS, visualRows) + 2));
	}

	private wrapLine(text: string, width: number): Array<{ start: number; end: number }> {
		if (text.length === 0) return [{ start: 0, end: 0 }];
		const segments: Array<{ start: number; end: number }> = [];
		let i = 0;
		while (text.length - i > width) {
			let k = -1;
			for (let j = i + width - 1; j >= i; j--) {
				if (text[j] === " ") {
					k = j;
					break;
				}
			}
			if (k >= 0) {
				segments.push({ start: i, end: k + 1 });
				i = k + 1;
			} else {
				segments.push({ start: i, end: i + width });
				i = i + width;
			}
		}
		segments.push({ start: i, end: text.length });
		return segments;
	}

	getVisualRows(textWidth?: number): Array<{ line: number; start: number; end: number }> {
		const w = textWidth !== undefined ? Math.max(1, textWidth) : (this.lastTextW > 0 ? this.lastTextW : Number.MAX_SAFE_INTEGER);
		const rows: Array<{ line: number; start: number; end: number }> = [];
		const lines = this.getLines();
		for (let li = 0; li < lines.length; li++) {
			for (const seg of this.wrapLine(lines[li]!, w)) {
				rows.push({ line: li, start: seg.start, end: seg.end });
			}
		}
		return rows;
	}

	private cursorVisual(textWidth?: number): { row: number; col: number } {
		const rows = this.getVisualRows(textWidth);
		const coord = this.getCursorCoord();
		let lastRow = -1;
		for (let r = 0; r < rows.length; r++) {
			const seg = rows[r]!;
			if (seg.line !== coord.line) continue;
			if (seg.start <= coord.col) lastRow = r;
			if (coord.col < seg.end) return { row: r, col: coord.col - seg.start };
		}
		if (lastRow >= 0) return { row: lastRow, col: coord.col - rows[lastRow]!.start };
		return { row: 0, col: 0 };
	}

	private setCursorFromVisual(rowIdx: number, colWithin: number, textWidth?: number): void {
		const rows = this.getVisualRows(textWidth);
		const row = Math.max(0, Math.min(rows.length - 1, rowIdx));
		const seg = rows[row]!;
		const col = Math.max(0, Math.min(seg.end - seg.start, colWithin));
		this.setCursorCoord(seg.line, seg.start + col);
	}

	getCursorCoord(): { line: number; col: number } {
		const lines = this.getLines();
		let rem = this.cursorPos;
		for (let i = 0; i < lines.length; i++) {
			const l = lines[i]!;
			if (rem <= l.length) {
				return { line: i, col: rem };
			}
			rem -= (l.length + 1); // +1 for '\n'
		}
		return { line: Math.max(0, lines.length - 1), col: lines[lines.length - 1]?.length ?? 0 };
	}

	setCursorCoord(targetLine: number, targetCol: number): void {
		const lines = this.getLines();
		const line = Math.max(0, Math.min(lines.length - 1, targetLine));
		let pos = 0;
		for (let i = 0; i < line; i++) {
			pos += lines[i]!.length + 1;
		}
		const col = Math.max(0, Math.min(lines[line]!.length, targetCol));
		this.cursorPos = pos + col;
		this.manualScroll = false;
	}

	insert(text: string): void {
		this.value = this.value.slice(0, this.cursorPos) + text + this.value.slice(this.cursorPos);
		this.cursorPos += text.length;
		this.manualScroll = false;
	}

	insertNewline(): void {
		this.insert("\n");
	}

	backspace(): void {
		if (this.cursorPos > 0) {
			this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
			this.cursorPos--;
			this.manualScroll = false;
		}
	}

	delete(): void {
		if (this.cursorPos < this.value.length) {
			this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
		}
	}

	left(): void {
		if (this.cursorPos > 0) {
			this.cursorPos--;
			this.manualScroll = false;
		}
	}

	right(): void {
		if (this.cursorPos < this.value.length) {
			this.cursorPos++;
			this.manualScroll = false;
		}
	}

	up(textWidth?: number): boolean {
		const vis = this.cursorVisual(textWidth);
		const rows = this.getVisualRows(textWidth);
		if (vis.row > 0) {
			const target = rows[vis.row - 1]!;
			this.setCursorFromVisual(vis.row - 1, Math.min(vis.col, target.end - target.start), textWidth);
			return true;
		}
		return false;
	}

	down(textWidth?: number): boolean {
		const vis = this.cursorVisual(textWidth);
		const rows = this.getVisualRows(textWidth);
		if (vis.row < rows.length - 1) {
			const target = rows[vis.row + 1]!;
			this.setCursorFromVisual(vis.row + 1, Math.min(vis.col, target.end - target.start), textWidth);
			return true;
		}
		return false;
	}

	home(): void {
		const coord = this.getCursorCoord();
		this.setCursorCoord(coord.line, 0);
	}

	end(): void {
		const lines = this.getLines();
		const coord = this.getCursorCoord();
		this.setCursorCoord(coord.line, lines[coord.line]?.length ?? 0);
	}

	submit(): string {
		const v = this.value.trim();
		if (v) {
			this.history.push(this.value);
			if (this.history.length > 200) this.history.shift();
		}
		this.value = "";
		this.cursorPos = 0;
		this.scrollRow = 0;
		this.manualScroll = false;
		this.historyPos = null;
		this.savedCurrent = "";
		this.clearSelection();
		return v;
	}

	historyPrev(): void {
		if (this.history.length === 0) return;
		if (this.historyPos === null) {
			this.savedCurrent = this.value;
			this.historyPos = this.history.length - 1;
		} else if (this.historyPos > 0) {
			this.historyPos--;
		}
		this.value = this.history[this.historyPos] ?? "";
		this.cursorPos = this.value.length;
		this.scrollRow = 0;
		this.manualScroll = false;
	}

	historyNext(): void {
		if (this.historyPos === null) return;
		if (this.historyPos < this.history.length - 1) {
			this.historyPos++;
			this.value = this.history[this.historyPos] ?? "";
		} else {
			this.historyPos = null;
			this.value = this.savedCurrent;
		}
		this.cursorPos = this.value.length;
		this.scrollRow = 0;
		this.manualScroll = false;
	}

	scrollBy(delta: number): void {
		const rows = this.getVisualRows();
		const max = Math.max(0, rows.length - this.lastInnerH);
		this.scrollRow = Math.max(0, Math.min(max, this.scrollRow + delta));
		this.manualScroll = true;
	}

	scrollToRatio(ratio: number): void {
		const rows = this.getVisualRows();
		const max = Math.max(0, rows.length - this.lastInnerH);
		this.scrollRow = Math.max(0, Math.min(max, Math.round(ratio * max)));
		this.manualScroll = true;
	}

	getThumbRow(trackH: number): number {
		const rows = this.getVisualRows();
		const max = Math.max(0, rows.length - this.lastInnerH);
		if (max <= 0 || trackH <= 0) return 0;
		const ratio = Math.max(0, Math.min(1, this.scrollRow / max));
		return Math.min(trackH - 1, Math.floor(ratio * trackH));
	}

	hasOverflow(): boolean {
		return this.getVisualRows().length > Math.max(1, this.lastInnerH);
	}

	startSelection(screenX: number, screenY: number = this.lastInnerY): void {
		const rows = this.getVisualRows();
		const relY = Math.max(0, screenY - this.lastInnerY);
		const targetRow = Math.max(0, Math.min(rows.length - 1, this.scrollRow + relY));
		const relX = Math.max(0, screenX - this.lastInnerX - 2);
		this.setCursorFromVisual(targetRow, relX);
		this.selectionStart = this.cursorPos;
		this.selectionEnd = this.cursorPos;
		this.selecting = true;
	}

	updateSelection(screenX: number, screenY: number = this.lastInnerY): void {
		if (!this.selecting || this.selectionStart === null) return;
		const rows = this.getVisualRows();
		const relY = Math.max(0, screenY - this.lastInnerY);
		const targetRow = Math.max(0, Math.min(rows.length - 1, this.scrollRow + relY));
		const relX = Math.max(0, screenX - this.lastInnerX - 2);
		this.setCursorFromVisual(targetRow, relX);
		this.selectionEnd = this.cursorPos;
	}

	finishSelection(): string | null {
		this.selecting = false;
		return this.getSelectedText();
	}

	clearSelection(): void {
		this.selectionStart = null;
		this.selectionEnd = null;
		this.selecting = false;
	}

	getSelectedText(): string | null {
		if (this.selectionStart === null || this.selectionEnd === null) return null;
		const start = Math.min(this.selectionStart, this.selectionEnd);
		const end = Math.max(this.selectionStart, this.selectionEnd);
		if (start === end) return null;
		return this.value.slice(start, end);
	}

	clear(): void {
		this.value = "";
		this.cursorPos = 0;
		this.scrollRow = 0;
		this.manualScroll = false;
		this.clearSelection();
	}

	render(
		screen: Screen,
		rect: Rect,
		focused: boolean,
		modelTitle?: string | null,
		effort?: string | null,
		planMode?: boolean,
	): { cursorX: number; cursorY: number } {
		const frameAttr = packAttr(focused ? THEME.activeFrame : THEME.inactiveFrame);
		const titleAttr = packAttr(focused ? THEME.panelTitleActive : THEME.panelTitle);
		const parts: string[] = [];
		const rawTitle = (modelTitle && modelTitle.trim()) ? modelTitle.trim() : "MESSAGE";
		parts.push(rawTitle);

		if (effort && effort.trim() && effort.trim().toLowerCase() !== "off") {
			parts.push(`[${effort.trim().toLowerCase()}]`);
		}

		parts.push(planMode ? "[PLAN]" : "[BUILD]");

		const lines = this.getLines();
		const title = `${parts.join(" ")}${focused ? " \u25c4" : ""}`;

		screen.boxDouble(rect.x, rect.y, rect.w, rect.h, frameAttr, title, titleAttr, {
			closeBox: true,
			zoomBox: true,
			winNum: 2,
		});

		const innerX = rect.x + 2;
		const innerY = rect.y + 1;
		const innerW = Math.max(0, rect.w - 4);
		const innerH = Math.max(1, rect.h - 2);
		this.lastInnerX = innerX;
		this.lastInnerY = innerY;
		this.lastInnerW = innerW;
		this.lastInnerH = innerH;

		const bgAttr = packAttr(THEME.inputText);
		const promptAttr = packAttr(THEME.inputPrompt);
		const selAttr = packAttr(THEME.inputSelection);

		// Fill inside of input window with desktop blue
		screen.fill(innerX, innerY, innerW, innerH, bgAttr);

		// Wrap width is the text area: inner width minus the 2-char prompt gutter
		this.lastTextW = Math.max(1, innerW - 2);
		const visualRows = this.getVisualRows();

		// Auto-scroll vertically with cursor unless the user scrolled manually
		if (!this.manualScroll) {
			const cv = this.cursorVisual();
			if (cv.row < this.scrollRow) {
				this.scrollRow = cv.row;
			} else if (cv.row >= this.scrollRow + innerH) {
				this.scrollRow = Math.max(0, cv.row - innerH + 1);
			}
		}
		const maxScroll = Math.max(0, visualRows.length - innerH);
		this.scrollRow = Math.max(0, Math.min(maxScroll, this.scrollRow));

		const selStart = this.selectionStart !== null && this.selectionEnd !== null ? Math.min(this.selectionStart, this.selectionEnd) : null;
		const selEnd = this.selectionStart !== null && this.selectionEnd !== null ? Math.max(this.selectionStart, this.selectionEnd) : null;

		// Cumulative start offset of each physical line within the raw value
		const lineOffset: number[] = [];
		let offset = 0;
		for (const l of lines) {
			lineOffset.push(offset);
			offset += l.length + 1;
		}

		const textX = innerX + 2;
		for (let row = 0; row < innerH; row++) {
			const vi = this.scrollRow + row;
			if (vi >= visualRows.length) break;
			const seg = visualRows[vi]!;
			const rowY = innerY + row;
			const lineText = lines[seg.line] ?? "";

			// Prompt symbol on first visible row or indent on continuation rows
			const prefix = vi === 0 ? "> " : "  ";
			screen.text(innerX, rowY, prefix, promptAttr);

			for (let ci = seg.start; ci < seg.end; ci++) {
				const ch = lineText[ci] ?? "";
				const charGlobalIdx = lineOffset[seg.line]! + ci;
				const isSel = selStart !== null && selEnd !== null && charGlobalIdx >= selStart && charGlobalIdx < selEnd;
				screen.setCell(textX + (ci - seg.start), rowY, ch, isSel ? selAttr : bgAttr);
			}
		}

		// Vertical scrollbar on input window if text rows exceed height
		if (rect.h > 4 && visualRows.length > innerH) {
			screen.scrollbarV(
				rect.x + rect.w - 1,
				rect.y + 1,
				rect.h - 2,
				visualRows.length,
				innerH,
				this.scrollRow,
				packAttr(THEME.windowScrollTrack),
				packAttr(THEME.windowScrollThumb),
				packAttr(THEME.windowScrollArrow),
			);
		}

		// Position cursor on terminal screen
		const cv = this.cursorVisual();
		const cursorScreenY = innerY + Math.max(0, Math.min(innerH - 1, cv.row - this.scrollRow));
		const cursorScreenX = Math.max(innerX + 2, Math.min(innerX + 2 + cv.col, innerX + innerW - 1));

		return {
			cursorX: cursorScreenX,
			cursorY: cursorScreenY,
		};
	}
}
