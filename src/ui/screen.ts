import { ANSI_RESET, DosColor, sgrFor } from "../theme/turbo-pascal.js";

interface Cell {
	ch: string;
	attr: number;
}

const EMPTY_CELL: Cell = { ch: " ", attr: -1 };

/**
 * Marker stored in the second cell of a wide (2-column) character. The cell
 * is consumed by the flush and never emitted, keeping the app's cell model
 * column-aligned with the terminal's display.
 */
const CONTINUATION = "\u0000";

/**
 * Display width of a single UTF-16 code unit as rendered by a VT terminal.
 * CJK ideographs, Hangul, fullwidth forms and wide emoji occupy 2 columns.
 * Surrogate halves are width 1 each so an emoji passes through as an adjacent
 * pair (2 columns total); a lone half degrades to a replacement glyph instead
 * of breaking layout. Box-drawing / arrows / block glyphs are width 1.
 */
export function charDisplayWidth(ch: string): number {
	const code = ch.charCodeAt(0);
	if (Number.isNaN(code) || code < 0x1100) return 1;
	if (code >= 0xd800 && code <= 0xdfff) return 1; // surrogate half
	if (
		code <= 0x115f || // Hangul Jamo
		code === 0x2329 || code === 0x232a || // angle brackets
		(code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) || // CJK radicals .. Yi
		(code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
		(code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
		(code >= 0xfe10 && code <= 0xfe19) || // vertical forms
		(code >= 0xfe30 && code <= 0xfe6f) || // CJK compatibility forms
		(code >= 0xff00 && code <= 0xff60) || // fullwidth forms
		(code >= 0xffe0 && code <= 0xffe6) || // fullwidth signs
		(code >= 0x1f300 && code <= 0x1f64f) || // emoji
		(code >= 0x1f900 && code <= 0x1f9ff) || // supplemental emoji
		(code >= 0x20000 && code <= 0x3fffd) // CJK ext. B+
	) {
		return 2;
	}
	return 1;
}

/** Total display width of a string in terminal columns. */
export function displayWidth(s: string): number {
	let w = 0;
	for (const ch of s) w += charDisplayWidth(ch);
	return w;
}

/** Longest prefix of `s` whose display width is at most `limit` columns. */
export function truncateToWidth(s: string, limit: number): string {
	if (limit <= 0) return "";
	let width = 0;
	let out = "";
	for (const ch of s) {
		const w = charDisplayWidth(ch);
		if (width + w > limit) break;
		out += ch;
		width += w;
	}
	return out;
}

/**
 * Double-buffered cell screen. Renders with pure ANSI (CUP + SGR), works in
 * Windows Terminal and any VT-compatible terminal. Full repaint per frame is
 * fine at TUI sizes; frames are coalesced by the caller.
 */
export class Screen {
	private cols = 0;
	private rows = 0;
	private cells: Cell[] = [];
	private prev: Cell[] = [];
	private started = false;

	constructor(cols = 0, rows = 0) {
		if (cols > 0 && rows > 0) {
			this.resize(cols, rows);
		}
	}

	start(): void {
		this.started = true;
		// Alternate screen buffer, hide cursor, clear.
		this.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
	}

	stop(): void {
		if (!this.started) return;
		this.started = false;
		this.write(`\x1b[0m\x1b[?25h${ANSI_RESET}\x1b[?1049l\x1b[2J\x1b[H`);
	}

	resize(cols: number, rows: number): void {
		this.cols = cols;
		this.rows = rows;
		const n = cols * rows;
		this.cells = new Array(n).fill(null).map(() => ({ ...EMPTY_CELL }));
		this.prev = new Array(n).fill(null).map(() => ({ ch: "\u0000", attr: -1 }));
		if (this.started) this.write("\x1b[2J");
	}

	get width(): number {
		return this.cols;
	}

	get height(): number {
		return this.rows;
	}

	clear(attr: number): void {
		for (const c of this.cells) {
			c.ch = " ";
			c.attr = attr;
		}
	}

	getCell(x: number, y: number): Cell | null {
		x = Math.round(x);
		y = Math.round(y);
		if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
		return this.cells[y * this.cols + x] ?? null;
	}

	setCell(x: number, y: number, ch: string, attr: number): void {
		x = Math.round(x);
		y = Math.round(y);
		if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
		if (ch === CONTINUATION) return; // never place the marker itself
		const cell = this.cells[y * this.cols + x];
		if (!cell) return;
		const w = charDisplayWidth(ch);
		if (w > 1) {
			// Wide char: occupies x and x+1. Clipped at the right edge — a wide
			// char at the last column would wrap onto the next terminal row.
			if (x + 1 >= this.cols) {
				cell.ch = " ";
				cell.attr = attr;
				return;
			}
			const next = this.cells[y * this.cols + x + 1];
			if (next) {
				next.ch = CONTINUATION;
				next.attr = attr;
			}
		}
		cell.ch = ch;
		cell.attr = attr;
	}

	text(x: number, y: number, s: string, attr: number): void {
		for (const ch of s) {
			const w = charDisplayWidth(ch);
			if (x + w > this.cols) break;
			this.setCell(x, y, ch, attr);
			x += w;
		}
	}

	textClipped(x: number, y: number, s: string, w: number, attr: number): void {
		const limit = x + w;
		for (const ch of s) {
			const cw = charDisplayWidth(ch);
			if (x + cw > limit) break;
			this.setCell(x, y, ch, attr);
			x += cw;
		}
	}

	fill(x: number, y: number, w: number, h: number, attr: number, ch = " "): void {
		for (let row = y; row < y + h; row++) {
			for (let col = x; col < x + w; col++) this.setCell(col, row, ch, attr);
		}
	}

	/** Classic single-line rectangular frame with optional embedded title. */
	box(x: number, y: number, w: number, h: number, attr: number, title?: string, titleAttr?: number): void {
		if (w < 2 || h < 2) return;
		this.setCell(x, y, "\u250c", attr);
		this.setCell(x + w - 1, y, "\u2510", attr);
		this.setCell(x, y + h - 1, "\u2514", attr);
		this.setCell(x + w - 1, y + h - 1, "\u2518", attr);
		for (let i = 1; i < w - 1; i++) {
			this.setCell(x + i, y, "\u2500", attr);
			this.setCell(x + i, y + h - 1, "\u2500", attr);
		}
		for (let j = 1; j < h - 1; j++) {
			this.setCell(x, y + j, "\u2502", attr);
			this.setCell(x + w - 1, y + j, "\u2502", attr);
		}
		if (title && title.length > 0 && w > 4) {
			const t = ` ${title} `;
			const tx = x + 2;
			const tt = truncateToWidth(t, w - 4);
			this.text(tx, y, tt, titleAttr ?? attr);
		}
	}

	/**
	 * Classic Turbo Pascal double-line window frame (╔═══...═══╗) with close box,
	 * centered title, and zoom box / window number.
	 */
	boxDouble(
		x: number,
		y: number,
		w: number,
		h: number,
		attr: number,
		title?: string,
		titleAttr?: number,
		options?: { closeBox?: boolean; zoomBox?: boolean; zoomed?: boolean; winNum?: number; active?: boolean },
	): void {
		if (w < 2 || h < 2) return;
		// Double-line box drawing characters
		// ╔ \u2554, ╗ \u2557, ╚ \u255a, ╝ \u255d, ═ \u2550, ║ \u2551
		this.setCell(x, y, "\u2554", attr);
		this.setCell(x + w - 1, y, "\u2557", attr);
		this.setCell(x, y + h - 1, "\u255a", attr);
		this.setCell(x + w - 1, y + h - 1, "\u255d", attr);

		for (let i = 1; i < w - 1; i++) {
			this.setCell(x + i, y, "\u2550", attr);
			this.setCell(x + i, y + h - 1, "\u2550", attr);
		}
		for (let j = 1; j < h - 1; j++) {
			this.setCell(x, y + j, "\u2551", attr);
			this.setCell(x + w - 1, y + j, "\u2551", attr);
		}

		// Close box on top-left: [■] with authentic Light Green bullet
		let leftReserved = 1;
		const greenAttr = (attr & 0xf0) | DosColor.LIGHTGREEN;
		if (options?.closeBox && w >= 8) {
			this.setCell(x + 2, y, "[", attr);
			this.setCell(x + 3, y, "\u25a0", greenAttr);
			this.setCell(x + 4, y, "]", attr);
			leftReserved = 6;
		}

		// Zoom box on top-right: [↑] (maximize) or [↕] (restore) with authentic Light Green arrow
		let rightReserved = 1;
		if (options?.zoomBox && w >= 12) {
			const zoomChar = options?.zoomed ? "\u2195" : "\u2191";
			this.setCell(x + w - 5, y, "[", attr);
			this.setCell(x + w - 4, y, zoomChar, greenAttr);
			this.setCell(x + w - 3, y, "]", attr);
			rightReserved = 6;
		}
		if (options?.winNum !== undefined && w >= rightReserved + 6) {
			const numStr = ` ${options.winNum} `;
			this.text(x + w - rightReserved - numStr.length, y, numStr, titleAttr ?? attr);
			rightReserved += numStr.length;
		}

		// Centered window title
		if (title && title.length > 0) {
			const t = ` ${title} `;
			const avail = w - leftReserved - rightReserved;
			if (avail > 4) {
				const tt = truncateToWidth(t, avail);
				const tw = displayWidth(tt);
				const tx = x + Math.floor((w - tw) / 2);
				this.text(tx, y, tt, titleAttr ?? attr);
			}
		}
	}

	/**
	 * Classic DOS vertical scrollbar rendered on a vertical column.
	 * Arrow up (▲), track (░), thumb (■), arrow down (▼).
	 */
	scrollbarV(
		x: number,
		y: number,
		h: number,
		total: number,
		visible: number,
		offset: number,
		trackAttr: number,
		thumbAttr: number,
		arrowAttr: number,
	): void {
		if (h < 3) return;
		this.setCell(x, y, "\u25b2", arrowAttr);
		this.setCell(x, y + h - 1, "\u25bc", arrowAttr);
		const trackH = h - 2;
		if (trackH <= 0) return;

		let thumbPos = 0;
		if (total > visible && total > 0) {
			const maxOffset = total - visible;
			const ratio = Math.max(0, Math.min(1, offset / maxOffset));
			thumbPos = Math.min(trackH - 1, Math.floor(ratio * trackH));
		}

		for (let row = 0; row < trackH; row++) {
			const cy = y + 1 + row;
			if (total > visible && row === thumbPos) {
				this.setCell(x, cy, "\u25a0", thumbAttr);
			} else {
				this.setCell(x, cy, "\u2591", trackAttr);
			}
		}
	}

	/**
	 * Classic DOS horizontal scrollbar rendered on a horizontal row.
	 * Arrow left (◄), track (░), thumb (■), arrow right (►).
	 */
	scrollbarH(
		x: number,
		y: number,
		w: number,
		total: number,
		visible: number,
		offset: number,
		trackAttr: number,
		thumbAttr: number,
		arrowAttr: number,
	): void {
		if (w < 3) return;
		this.setCell(x, y, "\u25c4", arrowAttr);
		this.setCell(x + w - 1, y, "\u25ba", arrowAttr);
		const trackW = w - 2;
		if (trackW <= 0) return;

		let thumbPos = 0;
		if (total > visible && total > 0) {
			const maxOffset = total - visible;
			const ratio = Math.max(0, Math.min(1, offset / maxOffset));
			thumbPos = Math.min(trackW - 1, Math.floor(ratio * trackW));
		}

		for (let col = 0; col < trackW; col++) {
			const cx = x + 1 + col;
			if (total > visible && col === thumbPos) {
				this.setCell(cx, y, "\u25a0", thumbAttr);
			} else {
				this.setCell(cx, y, "\u2591", trackAttr);
			}
		}
	}

	/** Borland-style drop shadow: 2 columns right + 1 row below a popup rect. */
	shadow(x: number, y: number, w: number, h: number, attr: number): void {
		// Right shadow: 2 columns wide from row y+1 to y+h
		for (let j = 1; j <= h; j++) {
			this.setCell(x + w, y + j, " ", attr);
			this.setCell(x + w + 1, y + j, " ", attr);
		}
		// Bottom shadow: 1 row below, spanning x+2 to x+w+1
		for (let i = 2; i <= w + 1; i++) {
			this.setCell(x + i, y + h, " ", attr);
		}
	}

	/**
	 * Flush the back buffer to the terminal. Only changed runs are emitted,
	 * cursor is repositioned per run via CUP. Returns data written.
	 */
	flush(cursor?: { x: number; y: number }): string {
		let out = "";
		let curAttr = -1;
		let curX = -1;
		let curY = -1;
		for (let y = 0; y < this.rows; y++) {
			for (let x = 0; x < this.cols; x++) {
				const idx = y * this.cols + x;
				const c = this.cells[idx];
				const p = this.prev[idx];
				if (!c || !p) continue;
				if (c.ch === CONTINUATION) {
					// Second half of a wide char: consumed by the char at x-1; adopt
					// into prev and never emit. Keeps the model column-aligned with
					// the terminal so runs can never drift past the right margin.
					p.ch = c.ch;
					p.attr = c.attr;
					continue;
				}
				if (p.ch === c.ch && p.attr === c.attr) continue;
				if (curX !== x || curY !== y) out += `\x1b[${y + 1};${x + 1}H`;
				if (c.attr !== curAttr) {
					out += sgrFor(c.attr);
					curAttr = c.attr;
				}
				out += c.ch;
				p.ch = c.ch;
				p.attr = c.attr;
				curX = x + charDisplayWidth(c.ch);
				curY = y;
				if (curX >= this.cols) {
					curX = -1;
				}
			}
		}
		if (out) out += ANSI_RESET;
		if (cursor) {
			out += `\x1b[${cursor.y + 1};${cursor.x + 1}H\x1b[?25h`;
		} else {
			out += "\x1b[?25l";
		}
		this.write(out);
		return out;
	}

	private write(data: string): void {
		if (!this.started && !data.startsWith("\x1b[?1049")) return;
		process.stdout.write(data);
	}
}
