import { packAttr, THEME, type ColorAttr } from "../theme/turbo-pascal.js";
import { inner, type Rect } from "../utils/layout.js";
import type { AgentEntry } from "../rpc/events.js";
import type { Screen } from "./screen.js";

interface RenderLine {
	segments: Array<{ text: string; attr: number }>;
}

const MAX_LINES = 5000;

// Classic Pascal & general programming keywords for retro syntax highlighting
const PASCAL_KEYWORDS = new Set([
	"program", "unit", "uses", "begin", "end", "var", "const", "type", "procedure",
	"function", "if", "then", "else", "case", "of", "while", "do", "repeat", "until",
	"for", "to", "downto", "array", "record", "set", "file", "with", "goto", "label",
	"nil", "not", "and", "or", "xor", "div", "mod", "in", "interface", "implementation",
	"import", "export", "class", "return", "async", "await", "let", "const", "function",
]);

/**
 * The agent panel: displays real Pi events (user messages, streamed agent
 * text, tool calls, errors) with retro syntax highlighting and full scrolling.
 */
export class AgentPanel {
	private entries: AgentEntry[] = [];
	/** true while a streaming assistant message is being accumulated. */
	private streamingOpen = false;
	private thinkingOpen = false;
	private scroll = 0;
	private autoScroll = true;

	clear(): void {
		this.entries = [];
		this.streamingOpen = false;
		this.thinkingOpen = false;
		this.scroll = 0;
		this.autoScroll = true;
	}

	addUserMessage(text: string): void {
		this.closeStream();
		this.entries.push({ kind: "user", text: "" });
		for (const line of text.split("\n")) {
			this.entries.push({ kind: "user", text: line });
		}
		this.autoScroll = true;
	}

	addEntry(entry: AgentEntry): void {
		if (entry.kind === "tool" || entry.kind === "error") this.closeStream();
		this.entries.push(entry);
		this.trim();
	}

	appendThinkingDelta(delta: string): void {
		if (!this.thinkingOpen) {
			this.closeStream();
			this.entries.push({ kind: "thinking", text: "" });
			this.thinkingOpen = true;
		}
		const target = this.entries[this.entries.length - 1];
		if (target && target.kind === "thinking") target.text += delta;
		this.trim();
	}

	appendStreamDelta(delta: string): void {
		if (!this.streamingOpen) {
			this.closeStream();
			this.entries.push({ kind: "agent", text: "" });
			this.streamingOpen = true;
		}
		const target = this.entries[this.entries.length - 1];
		if (target && target.kind === "agent") target.text += delta;
		this.trim();
	}

	closeStream(): void {
		this.streamingOpen = false;
		this.thinkingOpen = false;
	}

	setStatus(text: string): void {
		this.addEntry({ kind: "info", text });
	}

	getExportText(): string {
		const out: string[] = [];
		for (const e of this.entries) {
			switch (e.kind) {
				case "user":
					if (e.text) out.push(`\n### User:\n${e.text}`);
					break;
				case "agent":
					if (e.text) out.push(`\n### Assistant:\n${e.text}`);
					break;
				case "tool":
					out.push(`\n> [Tool ${e.tag ?? ""}] ${e.text}`);
					break;
				case "error":
					out.push(`\n> [Error] ${e.text}`);
					break;
				case "info":
					out.push(`\n> [Info] ${e.text}`);
					break;
			}
		}
		return out.join("\n").trim() + "\n";
	}

	scrollUp(lines = 1): void {
		this.autoScroll = false;
		this.scroll = Math.max(0, this.scroll - lines);
	}

	scrollDown(lines = 1): void {
		this.scroll += lines;
		// Will be clamped in render
	}

	pageUp(lines = 10): void {
		this.scrollUp(lines);
	}

	pageDown(lines = 10): void {
		this.scrollDown(lines);
	}

	scrollToTop(): void {
		this.autoScroll = false;
		this.scroll = 0;
	}

	scrollToBottom(): void {
		this.autoScroll = true;
	}

	private trim(): void {
		if (this.entries.length > MAX_LINES) {
			this.entries = this.entries.slice(-Math.floor(MAX_LINES / 2));
		}
	}

	private lastMaxScroll = 0;

	scrollToRatio(ratio: number): void {
		this.autoScroll = ratio >= 0.98;
		this.scroll = Math.max(0, Math.min(this.lastMaxScroll, Math.round(ratio * this.lastMaxScroll)));
	}

	getThumbRow(trackH: number): number {
		if (this.lastMaxScroll <= 0 || trackH <= 0) return 0;
		const ratio = Math.max(0, Math.min(1, this.scroll / this.lastMaxScroll));
		return Math.min(trackH - 1, Math.floor(ratio * trackH));
	}

	private selection: { startLine: number; startCol: number; endLine: number; endCol: number } | null = null;
	private selecting = false;
	private lastWidth = 80;

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

		const lines = this.buildLines(this.lastWidth);
		const parts: string[] = [];

		for (let l = sel.startLine; l <= sel.endLine && l < lines.length; l++) {
			const line = lines[l];
			if (!line) continue;
			const fullText = line.segments.map((s) => s.text).join("");
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
		const result = parts.join("\n");
		return result.length > 0 ? result : null;
	}

	render(
		screen: Screen,
		rect: Rect,
		focused: boolean,
		zoomed?: boolean,
		thinking?: { spinner: string; elapsedSec: number } | null,
		sessionName?: string | null,
	): void {
		const frameAttr = packAttr(focused ? THEME.activeFrame : THEME.inactiveFrame);
		const titleAttr = packAttr(focused ? THEME.panelTitleActive : THEME.panelTitle);
		const thinkingTag = thinking ? ` [ ${thinking.spinner} ]` : "";
		const name = sessionName && sessionName.trim() ? sessionName.trim() : "NONAME00.PAS";
		const title = `${name}${thinkingTag}${focused ? " \u25c4" : ""}`;

		screen.boxDouble(rect.x, rect.y, rect.w, rect.h, frameAttr, title, titleAttr, {
			closeBox: true,
			zoomBox: true,
			zoomed,
			winNum: 1,
		});

		const area = inner(rect);
		screen.fill(area.x, area.y, area.w, area.h, packAttr({ fg: THEME.agentText.fg, bg: THEME.desktop.bg }));
		if (area.w <= 0 || area.h <= 0) return;

		this.lastWidth = area.w;
		const lines = this.buildLines(area.w, thinking);
		const maxScroll = Math.max(0, lines.length - area.h);
		this.lastMaxScroll = maxScroll;

		if (this.autoScroll) {
			this.scroll = maxScroll;
		} else {
			this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
		}

		// Render text lines with selection highlight
		const sel = this.getNormalizedSelection();
		const selAttr = packAttr(THEME.selection);

		for (let row = 0; row < area.h; row++) {
			const lineIdx = this.scroll + row;
			const line = lines[lineIdx];
			if (!line) break;
			let col = 0;
			let x = area.x;
			for (const seg of line.segments) {
				if (x >= area.x + area.w) break;
				for (let i = 0; i < seg.text.length; i++) {
					if (x >= area.x + area.w) break;
					const char = seg.text[i]!;
					const isSel = sel ? isPosInSelection(lineIdx, col, sel) : false;
					screen.setCell(x, area.y + row, char, isSel ? selAttr : seg.attr);
					x++;
					col++;
				}
			}
		}

		// Vertical scrollbar on right border of window (rect.x + rect.w - 1)
		if (rect.h > 4) {
			screen.scrollbarV(
				rect.x + rect.w - 1,
				rect.y + 1,
				rect.h - 2,
				lines.length,
				area.h,
				this.scroll,
				packAttr(THEME.windowScrollTrack),
				packAttr(THEME.windowScrollThumb),
				packAttr(THEME.windowScrollArrow),
			);
		}

		// Line / position indicator on bottom border (e.g. " 42:150 ")
		const curLine = lines.length > 0 ? this.scroll + 1 : 1;
		const lineCounterStr = ` ${curLine}:${lines.length} `;
		if (rect.w >= lineCounterStr.length + 8) {
			screen.text(rect.x + 2, rect.y + rect.h - 1, lineCounterStr, packAttr(THEME.windowLineCounter));
		}
	}

	private buildLines(width: number, thinking?: { spinner: string; elapsedSec: number } | null): RenderLine[] {
		const out: RenderLine[] = [];
		let inCodeBlock = false;

		for (const e of this.entries) {
			switch (e.kind) {
				case "user": {
					if (!e.text) {
						out.push({ segments: [{ text: "", attr: packAttr(THEME.userText) }] });
						break;
					}
					const userPromptAttr = packAttr(THEME.userLabel);
					const userTextAttr = packAttr(THEME.userText);
					for (const raw of wrapText(e.text, width - 2)) {
						out.push({
							segments: [
								{ text: "> ", attr: userPromptAttr },
								{ text: raw, attr: userTextAttr },
							],
						});
					}
					break;
				}

				case "thinking": {
					const thinkAttr = packAttr(THEME.thinkingText);
					const rawLines = e.text.split("\n");
					for (const raw of rawLines) {
						for (const wrapped of wrapText(raw, width)) {
							out.push({ segments: [{ text: wrapped, attr: thinkAttr }] });
						}
					}
					break;
				}

				case "agent": {
					const textAttr = packAttr(THEME.agentText);
					const rawLines = e.text.split("\n");
					for (const raw of rawLines) {
						if (raw.startsWith("```")) {
							inCodeBlock = !inCodeBlock;
							out.push({
								segments: [{ text: raw.slice(0, width), attr: packAttr(THEME.agentComment) }],
							});
							continue;
						}

						if (inCodeBlock) {
							// Highlight code lines
							for (const wrapped of wrapText(raw, width)) {
								out.push(highlightCodeLine(wrapped));
							}
						} else if (raw.startsWith("#")) {
							// Markdown Header
							for (const wrapped of wrapText(raw, width)) {
								out.push({
									segments: [{ text: wrapped, attr: packAttr(THEME.panelTitleActive) }],
								});
							}
						} else {
							// Normal agent response prose
							for (const wrapped of wrapText(raw, width)) {
								out.push({ segments: [{ text: wrapped, attr: textAttr }] });
							}
						}
					}
					break;
				}

				case "tool":
				case "error": {
					const tag = e.tag ?? (e.kind === "error" ? "[ERROR]" : "[OK]");
					let tagTheme: ColorAttr = THEME.toolTag;
					if (e.isError) tagTheme = THEME.toolTagErr;
					else if (tag === "[RUN]" || tag === "[BASH]") tagTheme = THEME.toolTagBash;
					else if (tag === "[READ]" || tag === "[SEARCH]") tagTheme = THEME.toolTagRead;
					else if (tag === "[WRITE]" || tag === "[EDIT]") tagTheme = THEME.toolTagWrite;
					else if (tag === "[OK]") tagTheme = THEME.toolTagOk;

					const bodyTheme = e.isError ? THEME.errorText : THEME.agentText;
					const body = e.text ? ` ${e.text}` : "";
					out.push({
						segments: [
							{ text: tag.padEnd(8), attr: packAttr(tagTheme) },
							{ text: body.slice(0, width - 8), attr: packAttr(bodyTheme) },
						],
					});
					break;
				}

				case "info":
					out.push({ segments: [{ text: e.text.slice(0, width), attr: packAttr(THEME.dimText) }] });
					break;
			}
		}

		if (thinking) {
			const thinkingStr = ` ╟ Thinking [ ${thinking.spinner} ] (${thinking.elapsedSec.toFixed(1)}s)`;
			out.push({ segments: [{ text: thinkingStr.slice(0, width), attr: packAttr(THEME.thinkingText) }] });
		}

		return out;
	}
}

function wrapText(text: string, width: number): string[] {
	if (width <= 0) return [text];
	if (text.length <= width) return [text];
	const lines: string[] = [];
	for (let i = 0; i < text.length; i += width) {
		lines.push(text.slice(i, i + width));
	}
	return lines;
}

function highlightCodeLine(line: string): RenderLine {
	const defaultAttr = packAttr(THEME.agentText);
	const kwAttr = packAttr(THEME.agentKeyword);
	const strAttr = packAttr(THEME.agentString);
	const commentAttr = packAttr(THEME.agentComment);
	const numAttr = packAttr(THEME.agentNumber);

	if (line.trim().startsWith("//") || line.trim().startsWith("#") || line.trim().startsWith("{")) {
		return { segments: [{ text: line, attr: commentAttr }] };
	}

	const segments: Array<{ text: string; attr: number }> = [];
	const regex = /("[^"]*"|'[^']*'|\b\d+\b|[a-zA-Z_]\w*|\s+|[^\w\s"']+)/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(line)) !== null) {
		const token = match[0];
		if (!token) continue;
		if (token.startsWith('"') || token.startsWith("'")) {
			segments.push({ text: token, attr: strAttr });
		} else if (/^\d+$/.test(token)) {
			segments.push({ text: token, attr: numAttr });
		} else if (PASCAL_KEYWORDS.has(token.toLowerCase())) {
			segments.push({ text: token, attr: kwAttr });
		} else {
			segments.push({ text: token, attr: defaultAttr });
		}
	}

	if (segments.length === 0) segments.push({ text: line, attr: defaultAttr });
	return { segments };
}

export function isPosInSelection(
	line: number,
	col: number,
	sel: { startLine: number; startCol: number; endLine: number; endCol: number },
): boolean {
	if (line < sel.startLine || line > sel.endLine) return false;
	if (sel.startLine === sel.endLine) {
		return col >= sel.startCol && col <= sel.endCol;
	}
	if (line === sel.startLine) {
		return col >= sel.startCol;
	}
	if (line === sel.endLine) {
		return col <= sel.endCol;
	}
	return true;
}
