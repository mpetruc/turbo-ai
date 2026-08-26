import { packAttr, THEME } from "../theme/turbo-pascal.js";
import type { Rect } from "../utils/layout.js";
import type { Screen } from "./screen.js";

/**
 * Turbo Pascal style message input prompt window with adaptive multi-line height,
 * vertical and horizontal cursor navigation, editing, scrolling, history, and mouse selection.
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

	getLines(): string[] {
		return this.value.split("\n");
	}

	getRequiredHeight(maxTerminalRows: number): number {
		const lineCount = Math.max(1, this.getLines().length);
		const maxH = Math.max(3, Math.floor(maxTerminalRows / 2));
		return Math.max(3, Math.min(maxH, lineCount + 2));
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
	}

	insert(text: string): void {
		this.value = this.value.slice(0, this.cursorPos) + text + this.value.slice(this.cursorPos);
		this.cursorPos += text.length;
	}

	insertNewline(): void {
		this.insert("\n");
	}

	backspace(): void {
		if (this.cursorPos > 0) {
			this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
			this.cursorPos--;
		}
	}

	delete(): void {
		if (this.cursorPos < this.value.length) {
			this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
		}
	}

	left(): void {
		if (this.cursorPos > 0) this.cursorPos--;
	}

	right(): void {
		if (this.cursorPos < this.value.length) this.cursorPos++;
	}

	up(): boolean {
		const coord = this.getCursorCoord();
		if (coord.line > 0) {
			this.setCursorCoord(coord.line - 1, coord.col);
			return true;
		}
		return false;
	}

	down(): boolean {
		const lines = this.getLines();
		const coord = this.getCursorCoord();
		if (coord.line < lines.length - 1) {
			this.setCursorCoord(coord.line + 1, coord.col);
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
	}

	scrollBy(delta: number): void {
		const lines = this.getLines();
		const max = Math.max(0, lines.length - this.lastInnerH);
		this.scrollRow = Math.max(0, Math.min(max, this.scrollRow + delta));
	}

	scrollToRatio(ratio: number): void {
		const lines = this.getLines();
		const max = Math.max(0, lines.length - this.lastInnerH);
		this.scrollRow = Math.max(0, Math.min(max, Math.round(ratio * max)));
	}

	getThumbRow(trackH: number): number {
		const lines = this.getLines();
		const max = Math.max(0, lines.length - this.lastInnerH);
		if (max <= 0 || trackH <= 0) return 0;
		const ratio = Math.max(0, Math.min(1, this.scrollRow / max));
		return Math.min(trackH - 1, Math.floor(ratio * trackH));
	}

	startSelection(screenX: number, screenY: number = this.lastInnerY): void {
		const relY = Math.max(0, screenY - this.lastInnerY);
		const targetLine = this.scrollRow + relY;
		const relX = Math.max(0, screenX - this.lastInnerX - 2);
		this.setCursorCoord(targetLine, relX);
		this.selectionStart = this.cursorPos;
		this.selectionEnd = this.cursorPos;
		this.selecting = true;
	}

	updateSelection(screenX: number, screenY: number = this.lastInnerY): void {
		if (!this.selecting || this.selectionStart === null) return;
		const relY = Math.max(0, screenY - this.lastInnerY);
		const targetLine = this.scrollRow + relY;
		const relX = Math.max(0, screenX - this.lastInnerX - 2);
		this.setCursorCoord(targetLine, relX);
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

		// Auto-scroll vertically with cursor
		const cursorCoord = this.getCursorCoord();
		if (cursorCoord.line < this.scrollRow) {
			this.scrollRow = cursorCoord.line;
		} else if (cursorCoord.line >= this.scrollRow + innerH) {
			this.scrollRow = cursorCoord.line - innerH + 1;
		}
		const maxScroll = Math.max(0, lines.length - innerH);
		this.scrollRow = Math.max(0, Math.min(maxScroll, this.scrollRow));

		const selStart = this.selectionStart !== null && this.selectionEnd !== null ? Math.min(this.selectionStart, this.selectionEnd) : null;
		const selEnd = this.selectionStart !== null && this.selectionEnd !== null ? Math.max(this.selectionStart, this.selectionEnd) : null;

		let runningOffset = 0;
		for (let i = 0; i < this.scrollRow; i++) {
			runningOffset += lines[i]!.length + 1;
		}

		for (let row = 0; row < innerH; row++) {
			const lineIdx = this.scrollRow + row;
			if (lineIdx >= lines.length) break;
			const lineText = lines[lineIdx]!;
			const rowY = innerY + row;

			// Prompt symbol on first line or indent on continuation lines
			const prefix = lineIdx === 0 ? "> " : "  ";
			screen.text(innerX, rowY, prefix, promptAttr);

			const textX = innerX + prefix.length;
			const availW = Math.max(0, innerW - prefix.length);

			for (let ci = 0; ci < availW; ci++) {
				if (ci >= lineText.length) break;
				const ch = lineText[ci]!;
				const charGlobalIdx = runningOffset + ci;
				const isSel = selStart !== null && selEnd !== null && charGlobalIdx >= selStart && charGlobalIdx < selEnd;
				screen.setCell(textX + ci, rowY, ch, isSel ? selAttr : bgAttr);
			}

			runningOffset += lineText.length + 1;
		}

		// Vertical scrollbar on input window if multiple lines exceed height
		if (rect.h > 4 && lines.length > innerH) {
			screen.scrollbarV(
				rect.x + rect.w - 1,
				rect.y + 1,
				rect.h - 2,
				lines.length,
				innerH,
				this.scrollRow,
				packAttr(THEME.windowScrollTrack),
				packAttr(THEME.windowScrollThumb),
				packAttr(THEME.windowScrollArrow),
			);
		}

		// Position cursor on terminal screen
		const cursorRow = cursorCoord.line - this.scrollRow;
		const cursorScreenY = innerY + Math.max(0, Math.min(innerH - 1, cursorRow));
		const promptLen = 2;
		const cursorScreenX = innerX + promptLen + cursorCoord.col;

		return {
			cursorX: Math.max(innerX + promptLen, Math.min(cursorScreenX, innerX + innerW - 1)),
			cursorY: cursorScreenY,
		};
	}
}
