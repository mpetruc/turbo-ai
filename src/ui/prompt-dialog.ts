import { DosColor, packAttr, THEME } from "../theme/turbo-pascal.js";
import { centerRect, type Rect } from "../utils/layout.js";
import type { Screen } from "./screen.js";

/** Modal one-line input dialog with full cursor editing and DOS dialog styling. */
export class PromptDialog {
	value: string;
	cursorPos: number;
	rect: Rect;

	constructor(cols: number, rows: number, readonly title: string, prefill = "") {
		const w = Math.min(60, Math.max(38, cols - 6));
		const h = 8;
		this.rect = centerRect(cols, rows, w, h);
		this.value = prefill;
		this.cursorPos = this.value.length;
	}

	insert(ch: string): void {
		this.value = this.value.slice(0, this.cursorPos) + ch + this.value.slice(this.cursorPos);
		this.cursorPos += ch.length;
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

	home(): void {
		this.cursorPos = 0;
	}

	end(): void {
		this.cursorPos = this.value.length;
	}

	submit(): string {
		return this.value.trim();
	}

	render(screen: Screen): { cursorX: number; cursorY: number } {
		const { x, y, w, h } = this.rect;
		const frameAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const bgAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
		const titleAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const shadowAttr = packAttr(THEME.shadow);
		const inputBgAttr = packAttr(THEME.dialogInput);

		// Drop shadow
		screen.shadow(x, y, w, h, shadowAttr);

		// Dialog body (Light Gray)
		screen.fill(x, y, w, h, bgAttr);

		// Double border frame
		screen.boxDouble(x, y, w, h, frameAttr, this.title, titleAttr, { closeBox: true });

		// Input field box (cyan background)
		const inputY = y + 2;
		const inputX = x + 3;
		const inputW = w - 6;

		screen.fill(inputX, inputY, inputW, 1, inputBgAttr);

		// Horizontal scrolling for input text
		let scrollOffset = 0;
		if (this.cursorPos >= inputW) {
			scrollOffset = this.cursorPos - inputW + 1;
		}

		const visible = this.value.slice(scrollOffset, scrollOffset + inputW);
		screen.textClipped(inputX, inputY, visible, inputW, inputBgAttr);

		// Buttons: OK (with yellow 'K') and Cancel (green bg, black text)
		const btnY = y + 4;
		const btnOk = "    OK    ";
		const btnCancel = "  Cancel  ";
		const btnOkAttr = packAttr(THEME.dialogButtonActive);
		const btnOkKAttr = packAttr(THEME.dialogButtonOkK);
		const btnCancelAttr = packAttr(THEME.dialogButton);
		const btnShadowAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });

		const okX = x + Math.floor((w - 24) / 2);
		const cancelX = okX + btnOk.length + 3;

		// OK Button with yellow 'K'
		for (let i = 0; i < btnOk.length; i++) {
			const ch = btnOk[i]!;
			screen.setCell(okX + i, btnY, ch, ch === "K" ? btnOkKAttr : btnOkAttr);
		}
		screen.setCell(okX + btnOk.length, btnY, "\u2584", btnShadowAttr);
		for (let cx = okX + 1; cx <= okX + btnOk.length; cx++) {
			screen.setCell(cx, btnY + 1, "\u2580", btnShadowAttr);
		}

		// Cancel Button (green background, black text)
		screen.text(cancelX, btnY, btnCancel, btnCancelAttr);
		screen.setCell(cancelX + btnCancel.length, btnY, "\u2584", btnShadowAttr);
		for (let cx = cancelX + 1; cx <= cancelX + btnCancel.length; cx++) {
			screen.setCell(cx, btnY + 1, "\u2580", btnShadowAttr);
		}

		const cursorScreenX = inputX + (this.cursorPos - scrollOffset);
		return {
			cursorX: Math.max(inputX, Math.min(cursorScreenX, inputX + inputW - 1)),
			cursorY: inputY,
		};
	}
}
