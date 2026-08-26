import { DosColor, packAttr, THEME } from "../theme/turbo-pascal.js";
import { centerRect, inner, type Rect } from "../utils/layout.js";
import type { Screen } from "./screen.js";

export interface AddModelResult {
	provider: string;
	modelId: string;
	name: string;
	reasoning: boolean;
}

export const PROVIDER_CHOICES = [
	"openrouter",
	"opencode",
	"deepseek",
	"google",
	"anthropic",
	"openai",
	"groq",
	"mistral",
	"xai",
	"together",
	"custom",
];

/** Modal DOS dialog for adding a custom model to a provider and saving to models.json. */
export class AddModelDialog {
	providerIdx = 0;
	modelId = "";
	displayName = "";
	reasoning = true;
	fieldIndex = 0; // 0: Provider, 1: Model ID, 2: Display Name, 3: Reasoning, 4: Save, 5: Cancel
	cursorPos = 0;
	rect: Rect;
	title = "Add Custom Model";

	constructor(cols: number, rows: number, initialProvider = "openrouter") {
		const w = Math.min(64, Math.max(48, cols - 6));
		const h = 16;
		this.rect = centerRect(cols, rows, w, h);
		const found = PROVIDER_CHOICES.indexOf(initialProvider.toLowerCase());
		if (found !== -1) this.providerIdx = found;
	}

	get currentProvider(): string {
		return PROVIDER_CHOICES[this.providerIdx] ?? "openrouter";
	}

	nextField(): void {
		this.fieldIndex = (this.fieldIndex + 1) % 6;
		this.cursorPos = this.getActiveText().length;
	}

	prevField(): void {
		this.fieldIndex = (this.fieldIndex + 5) % 6;
		this.cursorPos = this.getActiveText().length;
	}

	cycleProvider(delta: number): void {
		this.providerIdx = (this.providerIdx + delta + PROVIDER_CHOICES.length) % PROVIDER_CHOICES.length;
	}

	toggleReasoning(): void {
		this.reasoning = !this.reasoning;
	}

	getActiveText(): string {
		if (this.fieldIndex === 1) return this.modelId;
		if (this.fieldIndex === 2) return this.displayName;
		return "";
	}

	setActiveText(val: string): void {
		if (this.fieldIndex === 1) this.modelId = val;
		if (this.fieldIndex === 2) this.displayName = val;
	}

	insert(ch: string): void {
		if (this.fieldIndex === 1 || this.fieldIndex === 2) {
			const text = this.getActiveText();
			const next = text.slice(0, this.cursorPos) + ch + text.slice(this.cursorPos);
			this.setActiveText(next);
			this.cursorPos += ch.length;
		}
	}

	backspace(): void {
		if (this.fieldIndex === 1 || this.fieldIndex === 2) {
			const text = this.getActiveText();
			if (this.cursorPos > 0) {
				const next = text.slice(0, this.cursorPos - 1) + text.slice(this.cursorPos);
				this.setActiveText(next);
				this.cursorPos--;
			}
		}
	}

	delete(): void {
		if (this.fieldIndex === 1 || this.fieldIndex === 2) {
			const text = this.getActiveText();
			if (this.cursorPos < text.length) {
				const next = text.slice(0, this.cursorPos) + text.slice(this.cursorPos + 1);
				this.setActiveText(next);
			}
		}
	}

	left(): void {
		if (this.fieldIndex === 0) this.cycleProvider(-1);
		else if (this.cursorPos > 0) this.cursorPos--;
	}

	right(): void {
		if (this.fieldIndex === 0) this.cycleProvider(1);
		else if (this.cursorPos < this.getActiveText().length) this.cursorPos++;
	}

	home(): void {
		this.cursorPos = 0;
	}

	end(): void {
		this.cursorPos = this.getActiveText().length;
	}

	submit(): AddModelResult | null {
		const id = this.modelId.trim();
		if (!id) return null;
		const name = this.displayName.trim() || id;
		return {
			provider: this.currentProvider,
			modelId: id,
			name,
			reasoning: this.reasoning,
		};
	}

	render(screen: Screen): { cursorX?: number; cursorY?: number } {
		const { x, y, w, h } = this.rect;
		const frameAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const bgAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
		const titleAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const shadowAttr = packAttr(THEME.shadow);
		const inputAttr = packAttr(THEME.dialogInput);
		const labelAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
		const focusedLabelAttr = packAttr({ fg: DosColor.YELLOW, bg: DosColor.LIGHTGRAY });

		screen.shadow(x, y, w, h, shadowAttr);
		screen.fill(x, y, w, h, bgAttr);
		screen.boxDouble(x, y, w, h, frameAttr, this.title, titleAttr, { closeBox: true });

		const a = inner(this.rect);
		let curPos: { cursorX: number; cursorY: number } | undefined;

		// 1. Provider selector
		const provY = a.y + 1;
		screen.text(a.x + 1, provY, "Provider:".padEnd(14), this.fieldIndex === 0 ? focusedLabelAttr : labelAttr);
		const provText = ` < ${this.currentProvider.toUpperCase()} > `;
		const provAttr = this.fieldIndex === 0 ? packAttr(THEME.dialogButtonOkK) : packAttr(THEME.dialogButton);
		screen.text(a.x + 16, provY, provText, provAttr);

		// 2. Model ID input
		const idY = a.y + 3;
		screen.text(a.x + 1, idY, "Model ID:".padEnd(14), this.fieldIndex === 1 ? focusedLabelAttr : labelAttr);
		const inputW = a.w - 18;
		screen.fill(a.x + 16, idY, inputW, 1, inputAttr);
		screen.text(a.x + 16, idY, this.modelId.slice(0, inputW), inputAttr);
		if (this.fieldIndex === 1) {
			curPos = { cursorX: a.x + 16 + Math.min(this.cursorPos, inputW - 1), cursorY: idY };
		}

		// 3. Display Name input
		const nameY = a.y + 5;
		screen.text(a.x + 1, nameY, "Display Name:".padEnd(14), this.fieldIndex === 2 ? focusedLabelAttr : labelAttr);
		screen.fill(a.x + 16, nameY, inputW, 1, inputAttr);
		screen.text(a.x + 16, nameY, this.displayName.slice(0, inputW), inputAttr);
		if (this.fieldIndex === 2) {
			curPos = { cursorX: a.x + 16 + Math.min(this.cursorPos, inputW - 1), cursorY: nameY };
		}

		// 4. Reasoning toggle
		const reasonY = a.y + 7;
		screen.text(a.x + 1, reasonY, "Reasoning:".padEnd(14), this.fieldIndex === 3 ? focusedLabelAttr : labelAttr);
		const checkMark = this.reasoning ? "[X] Yes (Thinking)" : "[ ] No";
		const reasonAttr = this.fieldIndex === 3 ? packAttr(THEME.dialogButtonOkK) : packAttr(THEME.dialogButton);
		screen.text(a.x + 16, reasonY, checkMark, reasonAttr);

		// Hint at bottom
		screen.text(a.x + 1, a.y + 9, "Tab / Shift+Tab switches fields, Space toggles checkbox", packAttr({ fg: DosColor.DARKGRAY, bg: DosColor.LIGHTGRAY }));

		// Buttons at bottom
		const btnY = y + h - 2;
		const saveText = " [ Save Model ] ";
		const cancelText = " [ Cancel ] ";
		const totalBtnW = saveText.length + cancelText.length + 3;
		const startBtnX = x + Math.max(2, Math.floor((w - totalBtnW) / 2));

		// Save Button
		const saveX = startBtnX;
		const saveAttr = this.fieldIndex === 4 ? packAttr(THEME.dialogButtonOkK) : packAttr(THEME.dialogButton);
		screen.text(saveX, btnY, saveText, saveAttr);
		if (this.fieldIndex !== 4) screen.setCell(saveX + 3, btnY, "S", packAttr(THEME.dialogButtonOkK)); // Yellow 'S'

		// Cancel Button
		const cancelX = saveX + saveText.length + 2;
		const cancelAttr = this.fieldIndex === 5 ? packAttr(THEME.dialogButtonOkK) : packAttr(THEME.dialogButton);
		screen.text(cancelX, btnY, cancelText, cancelAttr);

		return curPos ?? { cursorX: -1, cursorY: -1 };
	}
}
