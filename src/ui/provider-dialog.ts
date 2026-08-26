import { DosColor, packAttr, THEME } from "../theme/turbo-pascal.js";
import { centerRect, inner, type Rect } from "../utils/layout.js";
import { maskApiKey, readEnvKey } from "../commands/commands.js";
import type { Screen } from "./screen.js";

export interface ProviderEntry {
	id: string;
	name: string;
	envVar: string;
	description: string;
}

export const KNOWN_PROVIDERS: ProviderEntry[] = [
	{ id: "openrouter", name: "OpenRouter (All Models)", envVar: "OPENROUTER_API_KEY", description: "100+ models: Claude, GPT, DeepSeek, Llama, Qwen" },
	{ id: "opencode", name: "OpenCode (MiMo, etc.)", envVar: "OPENCODE_API_KEY", description: "OpenCode AI platform and MiMo-V2.5 models" },
	{ id: "deepseek", name: "DeepSeek (V3 / R1)", envVar: "DEEPSEEK_API_KEY", description: "DeepSeek V3 (chat) and DeepSeek R1 (reasoner)" },
	{ id: "gemini", name: "Google Gemini", envVar: "GEMINI_API_KEY", description: "Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash Thinking" },
	{ id: "anthropic", name: "Anthropic Claude", envVar: "ANTHROPIC_API_KEY", description: "Claude 3.7 Sonnet, 3.5 Sonnet, 3.5 Haiku" },
	{ id: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY", description: "GPT-4o, GPT-4o-mini, o3-mini, o1" },
	{ id: "groq", name: "Groq", envVar: "GROQ_API_KEY", description: "Ultra-fast inference for Llama 3.3, Mixtral" },
	{ id: "mistral", name: "Mistral AI", envVar: "MISTRAL_API_KEY", description: "Mistral Large, Codestral" },
	{ id: "xai", name: "xAI Grok", envVar: "XAI_API_KEY", description: "Grok-beta, Grok-2" },
	{ id: "together", name: "Together AI", envVar: "TOGETHER_API_KEY", description: "Fast open source models hosting" },
];

export class ProviderDialog {
	index = 0;
	rect: Rect;
	title = "API Keys & LLM Providers";

	constructor(cols: number, rows: number, readonly cwd: string) {
		const w = Math.min(68, Math.max(48, cols - 6));
		const h = Math.min(18, Math.max(14, rows - 4));
		this.rect = centerRect(cols, rows, w, h);
	}

	get providers(): ProviderEntry[] {
		return KNOWN_PROVIDERS;
	}

	current(): ProviderEntry | null {
		return KNOWN_PROVIDERS[this.index] ?? null;
	}

	up(): void {
		if (this.index > 0) this.index--;
	}

	down(): void {
		if (this.index < KNOWN_PROVIDERS.length - 1) this.index++;
	}

	home(): void {
		this.index = 0;
	}

	end(): void {
		this.index = Math.max(0, KNOWN_PROVIDERS.length - 1);
	}

	findByDigit(ch: string): number | null {
		const num = parseInt(ch, 10);
		if (num >= 1 && num <= KNOWN_PROVIDERS.length) {
			this.index = num - 1;
			return this.index;
		}
		return null;
	}

	render(screen: Screen): void {
		const { x, y, w, h } = this.rect;
		const frameAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const bgAttr = packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
		const titleAttr = packAttr({ fg: DosColor.WHITE, bg: DosColor.LIGHTGRAY });
		const shadowAttr = packAttr(THEME.shadow);

		// Drop shadow & dialog background
		screen.shadow(x, y, w, h, shadowAttr);
		screen.fill(x, y, w, h, bgAttr);
		screen.boxDouble(x, y, w, h, frameAttr, this.title, titleAttr, { closeBox: true });

		const a = inner(this.rect);
		const listY = a.y + 1;
		const maxRows = Math.max(4, a.h - 5);

		// Header hint
		screen.text(a.x + 1, a.y, "Select provider to view or set API key:".slice(0, a.w - 2), packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY }));

		for (let i = 0; i < Math.min(KNOWN_PROVIDERS.length, maxRows); i++) {
			const p = KNOWN_PROVIDERS[i]!;
			const isSel = i === this.index;
			const rowY = listY + i;
			const rowAttr = isSel ? packAttr(THEME.dialogButton) : packAttr({ fg: DosColor.BLACK, bg: DosColor.LIGHTGRAY });
			const numAttr = isSel ? packAttr(THEME.dialogButtonOkK) : packAttr({ fg: DosColor.RED, bg: DosColor.LIGHTGRAY });
			const keyVal = readEnvKey(this.cwd, p.envVar);
			const isConfigured = keyVal !== null && keyVal.trim().length > 0;
			const status = isConfigured ? maskApiKey(keyVal) : "Not Set";
			const statusColor = isSel
				? isConfigured ? packAttr({ fg: DosColor.YELLOW, bg: DosColor.GREEN }) : packAttr({ fg: DosColor.BLACK, bg: DosColor.GREEN })
				: isConfigured ? packAttr({ fg: DosColor.DARKGRAY, bg: DosColor.LIGHTGRAY }) : packAttr({ fg: DosColor.RED, bg: DosColor.LIGHTGRAY });

			screen.fill(a.x + 1, rowY, a.w - 2, 1, rowAttr);

			// Digit index
			screen.text(a.x + 2, rowY, `${i + 1}.`, numAttr);

			// Provider name
			const nameStr = p.name;
			screen.text(a.x + 5, rowY, nameStr.slice(0, a.w - 20), rowAttr);

			// Status tag right-aligned
			const statusStr = `[ ${status} ]`;
			screen.text(a.x + a.w - 2 - statusStr.length, rowY, statusStr, statusColor);
		}

		// Divider
		const divY = a.y + maxRows + 1;
		for (let cx = a.x; cx < a.x + a.w; cx++) {
			screen.setCell(cx, divY, "\u2500", packAttr({ fg: DosColor.DARKGRAY, bg: DosColor.LIGHTGRAY }));
		}

		// Active description
		const cur = this.current();
		if (cur) {
			const desc = `${cur.envVar}: ${cur.description}`;
			screen.text(a.x + 1, divY + 1, desc.slice(0, a.w - 2), packAttr({ fg: DosColor.DARKGRAY, bg: DosColor.LIGHTGRAY }));
		}

		// Buttons at the bottom
		const btnY = y + h - 2;
		const setKeyText = " [ Set Key ] ";
		const closeText = " [ Close ] ";
		const totalBtnW = setKeyText.length + closeText.length + 3;
		const startBtnX = x + Math.max(2, Math.floor((w - totalBtnW) / 2));

		// Set Key Button (Enter)
		const setKeyX = startBtnX;
		screen.text(setKeyX, btnY, setKeyText, packAttr(THEME.dialogButton));
		screen.setCell(setKeyX + 3, btnY, "S", packAttr(THEME.dialogButtonOkK)); // Yellow 'S'

		// Close Button (Esc)
		const closeX = setKeyX + setKeyText.length + 2;
		screen.text(closeX, btnY, closeText, packAttr(THEME.dialogButton));
	}
}
