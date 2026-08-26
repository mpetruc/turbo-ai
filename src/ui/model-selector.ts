import { DosColor, packAttr, THEME } from "../theme/turbo-pascal.js";
import { centerRect, inner, type Rect } from "../utils/layout.js";
import type { ModelInfo } from "../rpc/types.js";
import type { Screen } from "./screen.js";

/** Model selector popup dialog backed by Pi's get_available_models RPC. */
export class ModelSelector {
	private items: ModelInfo[] = [];
	index = 0;
	rect: Rect;
	title = "Select AI Model";

	constructor(cols: number, rows: number) {
		const w = Math.min(68, Math.max(40, cols - 6));
		const h = Math.min(16, Math.max(12, rows - 6));
		this.rect = centerRect(cols, rows, w, h);
	}

	setModels(models: ModelInfo[]): void {
		const customEntry: ModelInfo = {
			id: "__custom__",
			name: "[+] Enter custom model ID...",
			provider: "CUSTOM",
			api: "",
		};
		this.items = [customEntry, ...models];
		this.index = 0;
	}

	get models(): ModelInfo[] {
		return this.items;
	}

	current(): ModelInfo | null {
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

	scrollToRatio(ratio: number): void {
		if (this.items.length === 0) return;
		this.index = Math.max(0, Math.min(this.items.length - 1, Math.round(ratio * (this.items.length - 1))));
	}

	getThumbRow(trackH: number): number {
		if (this.items.length <= 1 || trackH <= 0) return 0;
		const ratio = Math.max(0, Math.min(1, this.index / (this.items.length - 1)));
		return Math.min(trackH - 1, Math.floor(ratio * trackH));
	}

	renderLoading(screen: Screen, text: string): void {
		this.paintFrame(screen);
		const a = inner(this.rect);
		screen.text(a.x + 2, a.y + 2, text.slice(0, a.w - 4), packAttr(THEME.dimText));
	}

	renderError(screen: Screen, message: string): void {
		this.paintFrame(screen);
		const a = inner(this.rect);
		screen.text(a.x + 2, a.y + 2, message.slice(0, a.w - 4), packAttr(THEME.errorText));
	}

	private paintFrame(screen: Screen): void {
		screen.shadow(this.rect.x, this.rect.y, this.rect.w, this.rect.h, packAttr(THEME.shadow));
		screen.fill(this.rect.x, this.rect.y, this.rect.w, this.rect.h, packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY }));
		screen.boxDouble(
			this.rect.x,
			this.rect.y,
			this.rect.w,
			this.rect.h,
			packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY }),
			this.title,
			packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY }),
			{ closeBox: true },
		);
	}

	render(screen: Screen): void {
		this.paintFrame(screen);
		const a = inner(this.rect);
		const listH = a.h - 3; // Reserve space for 3D buttons

		if (this.items.length === 0) {
			screen.text(a.x + 2, a.y + 2, "(no models available)", packAttr(THEME.dimText));
			return;
		}

		const offset = Math.max(0, Math.min(this.index - Math.floor(listH / 2), this.items.length - listH));
		const listW = a.w - 2;

		for (let row = 0; row < listH; row++) {
			const idx = offset + row;
			if (idx >= this.items.length) break;
			const m = this.items[idx];
			if (!m) break;

			const selected = idx === this.index;
			const isCustom = m.id === "__custom__";
			const rowAttr = selected
				? packAttr(THEME.menuHighlight)
				: isCustom
				? packAttr({ fg: DosColor.YELLOW, bg: DosColor.LIGHTGRAY })
				: packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
			const label = (isCustom ? m.name : `${m.provider}/${m.id}`).slice(0, listW - 2);

			screen.fill(a.x + 1, a.y + row, listW, 1, rowAttr);
			screen.text(a.x + 2, a.y + row, label, rowAttr);
		}

		// Scrollbar along the right edge of the list
		if (listH > 2) {
			screen.scrollbarV(
				a.x + a.w - 1,
				a.y,
				listH,
				this.items.length,
				listH,
				offset,
				packAttr(THEME.windowScrollTrack),
				packAttr(THEME.windowScrollThumb),
				packAttr(THEME.windowScrollArrow),
			);
		}

		// Buttons: Select and Cancel (green background, black text)
		const btnY = this.rect.y + this.rect.h - 3;
		const btnSelect = "  Select  ";
		const btnCancel = "  Cancel  ";
		const btnAttr = packAttr(THEME.dialogButton);
		const btnShadowAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });

		const selectX = this.rect.x + Math.floor((this.rect.w - 26) / 2);
		const cancelX = selectX + btnSelect.length + 3;

		// Select Button (green bg, black text)
		screen.text(selectX, btnY, btnSelect, btnAttr);
		screen.setCell(selectX + btnSelect.length, btnY, "\u2584", btnShadowAttr);
		for (let cx = selectX + 1; cx <= selectX + btnSelect.length; cx++) {
			screen.setCell(cx, btnY + 1, "\u2580", btnShadowAttr);
		}

		// Cancel Button (green bg, black text)
		screen.text(cancelX, btnY, btnCancel, btnAttr);
		screen.setCell(cancelX + btnCancel.length, btnY, "\u2584", btnShadowAttr);
		for (let cx = cancelX + 1; cx <= cancelX + btnCancel.length; cx++) {
			screen.setCell(cx, btnY + 1, "\u2580", btnShadowAttr);
		}
	}
}
