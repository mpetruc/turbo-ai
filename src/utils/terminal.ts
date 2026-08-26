export interface KeyEvent {
	name: string; // readline key name: "f1", "up", "enter", "escape", undefined for printable
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	sequence: string; // raw bytes as string
}

export interface MouseEvent {
	button: "left" | "middle" | "right" | "wheelUp" | "wheelDown" | "other";
	action: "down" | "up" | "drag";
	x: number; // 0-based column
	y: number; // 0-based row
	shift: boolean;
	ctrl: boolean;
	alt: boolean;
}

export function parseSgrMouse(b: number, x: number, y: number, type: string): MouseEvent {
	const shift = (b & 4) !== 0;
	const alt = (b & 8) !== 0;
	const ctrl = (b & 16) !== 0;
	const motion = (b & 32) !== 0;

	let button: MouseEvent["button"] = "other";
	let action: MouseEvent["action"] = type === "m" ? "up" : motion ? "drag" : "down";

	if (b & 64) {
		const wheel = b & 3;
		if (wheel === 0) button = "wheelUp";
		else if (wheel === 1) button = "wheelDown";
		action = "down";
	} else {
		const btn = b & 3;
		if (btn === 0) button = "left";
		else if (btn === 1) button = "middle";
		else if (btn === 2) button = "right";
		else if (btn === 3) {
			button = "left";
			action = "up";
		}
	}

	return {
		button,
		action,
		x: Math.max(0, x - 1),
		y: Math.max(0, y - 1),
		shift,
		ctrl,
		alt,
	};
}

const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
const X10_MOUSE_RE = /^\x1b\[M([\s\S])([\s\S])([\s\S])/;
const URXVT_MOUSE_RE = /^\x1b\[(\d+);(\d+);(\d+)M/;

const CSI_TILDE_RE = /^\x1b\[(\d+)~/;
const CSI_PARAM_RE = /^\x1b\[(\d+)(?:;(\d+))?([~u])/;
const CSI_LETTER_RE = /^\x1b\[([A-Za-z])/;
const SS3_RE = /^\x1bO([A-Za-z])/;
const ALT_KEY_RE = /^\x1b([a-zA-Z0-9])/;

const TILDE_MAP: Record<string, string> = {
	"1": "home",
	"2": "insert",
	"3": "delete",
	"4": "end",
	"5": "pageup",
	"6": "pagedown",
	"7": "home",
	"8": "end",
	"11": "f1",
	"12": "f2",
	"13": "f3",
	"14": "f4",
	"15": "f5",
	"17": "f6",
	"18": "f7",
	"19": "f8",
	"20": "f9",
	"21": "f10",
	"23": "f11",
	"24": "f12",
};

const SS3_MAP: Record<string, string> = {
	P: "f1",
	Q: "f2",
	R: "f3",
	S: "f4",
	A: "up",
	B: "down",
	C: "right",
	D: "left",
	H: "home",
	F: "end",
};

const CSI_MAP: Record<string, string> = {
	A: "up",
	B: "down",
	C: "right",
	D: "left",
	H: "home",
	F: "end",
	Z: "tab", // Shift+Tab
};

/**
 * Parses raw terminal chunks directly into structured KeyEvents and MouseEvents.
 * Ensures mouse sequences (\x1b[<...M) are never split or leaked as keyboard characters.
 */
export function processInputBuffer(
	buf: string,
	onKey: (key: KeyEvent) => void,
	onMouse: (mouse: MouseEvent) => void,
): string {
	let i = 0;
	while (i < buf.length) {
		const rest = buf.slice(i);

		// 1. SGR Mouse: \x1b[<b;x;yM or \x1b[<b;x;ym
		const sgrMatch = SGR_MOUSE_RE.exec(rest);
		if (sgrMatch && sgrMatch[1] && sgrMatch[2] && sgrMatch[3] && sgrMatch[4]) {
			const b = parseInt(sgrMatch[1], 10);
			const x = parseInt(sgrMatch[2], 10);
			const y = parseInt(sgrMatch[3], 10);
			const type = sgrMatch[4];
			onMouse(parseSgrMouse(b, x, y, type));
			i += sgrMatch[0].length;
			continue;
		}

		// 2. X10 Mouse: \x1b[Mbxy
		const x10Match = X10_MOUSE_RE.exec(rest);
		if (x10Match && x10Match[1] && x10Match[2] && x10Match[3]) {
			const b = x10Match[1].charCodeAt(0) - 32;
			const x = x10Match[2].charCodeAt(0) - 32;
			const y = x10Match[3].charCodeAt(0) - 32;
			onMouse(parseSgrMouse(b, x, y, "M"));
			i += x10Match[0].length;
			continue;
		}

		// 3. URXVT Mouse: \x1b[b;x;yM
		const urxvtMatch = URXVT_MOUSE_RE.exec(rest);
		if (urxvtMatch && urxvtMatch[1] && urxvtMatch[2] && urxvtMatch[3]) {
			const b = parseInt(urxvtMatch[1], 10) - 32;
			const x = parseInt(urxvtMatch[2], 10);
			const y = parseInt(urxvtMatch[3], 10);
			onMouse(parseSgrMouse(b, x, y, "M"));
			i += urxvtMatch[0].length;
			continue;
		}

		// 4. CSI param keys (CSI u, e.g. Shift+Enter \x1b[13;2u or modified F-keys)
		const csiParamMatch = CSI_PARAM_RE.exec(rest);
		if (csiParamMatch && csiParamMatch[1]) {
			const keyNum = parseInt(csiParamMatch[1], 10);
			const mod = csiParamMatch[2] ? parseInt(csiParamMatch[2], 10) : 1;
			const shift = (mod - 1 & 1) !== 0 || mod === 2;
			const alt = (mod - 1 & 2) !== 0 || mod === 3;
			const ctrl = (mod - 1 & 4) !== 0 || mod === 5;
			if (keyNum === 13 || keyNum === 10) {
				onKey({ name: "enter", ctrl, alt, shift, sequence: csiParamMatch[0] });
				i += csiParamMatch[0].length;
				continue;
			}
			const name = TILDE_MAP[String(keyNum)] ?? "";
			if (name) {
				onKey({ name, ctrl, alt, shift, sequence: csiParamMatch[0] });
				i += csiParamMatch[0].length;
				continue;
			}
		}

		// 5. CSI ~ keys (F1-F12, Delete, PageUp, PageDown, Home, End)
		const tildeMatch = CSI_TILDE_RE.exec(rest);
		if (tildeMatch && tildeMatch[1]) {
			const code = tildeMatch[1];
			const name = TILDE_MAP[code] ?? "";
			onKey({ name, ctrl: false, alt: false, shift: false, sequence: tildeMatch[0] });
			i += tildeMatch[0].length;
			continue;
		}

		// 6. CSI letter keys (Arrows, Home, End, Shift-Tab)
		const csiLetterMatch = CSI_LETTER_RE.exec(rest);
		if (csiLetterMatch && csiLetterMatch[1]) {
			const letter = csiLetterMatch[1];
			const name = CSI_MAP[letter] ?? "";
			onKey({ name, ctrl: false, alt: false, shift: false, sequence: csiLetterMatch[0] });
			i += csiLetterMatch[0].length;
			continue;
		}

		// 7. SS3 keys (\x1bOP..\x1bOS for F1..F4, \x1bOA..\x1bOD for Arrows)
		const ss3Match = SS3_RE.exec(rest);
		if (ss3Match && ss3Match[1]) {
			const letter = ss3Match[1];
			const name = SS3_MAP[letter] ?? "";
			onKey({ name, ctrl: false, alt: false, shift: false, sequence: ss3Match[0] });
			i += ss3Match[0].length;
			continue;
		}

		// 8. Alt + Enter (\x1b\r or \x1b\n)
		if (rest.charCodeAt(0) === 27 && (rest.charCodeAt(1) === 13 || rest.charCodeAt(1) === 10)) {
			onKey({ name: "enter", ctrl: false, alt: true, shift: false, sequence: rest.slice(0, 2) });
			i += (rest.charCodeAt(1) === 13 && rest.charCodeAt(2) === 10) ? 3 : 2;
			continue;
		}

		// 9. Alt + key (\x1b + letter/number)
		const altMatch = ALT_KEY_RE.exec(rest);
		if (altMatch && altMatch[1]) {
			const ch = altMatch[1];
			onKey({ name: ch.toLowerCase(), ctrl: false, alt: true, shift: false, sequence: altMatch[0] });
			i += altMatch[0].length;
			continue;
		}

		// Check if start of an incomplete escape sequence
		if (rest.startsWith("\x1b[") || rest.startsWith("\x1bO")) {
			return rest;
		}

		// Lone Escape (\x1b)
		if (rest.charCodeAt(0) === 27) {
			if (rest.length === 1) {
				return rest;
			}
			onKey({ name: "escape", ctrl: false, alt: false, shift: false, sequence: "\x1b" });
			i += 1;
			continue;
		}

		// Enter / Return
		const ch = rest.charAt(0);
		const code = rest.charCodeAt(0);

		if (code === 13 || code === 10) {
			onKey({ name: "enter", ctrl: false, alt: false, shift: false, sequence: "\r" });
			i += 1;
			if (code === 13 && i < buf.length && buf.charCodeAt(i) === 10) {
				i += 1;
			}
			continue;
		}

		// Tab
		if (code === 9) {
			onKey({ name: "tab", ctrl: false, alt: false, shift: false, sequence: "\t" });
			i += 1;
			continue;
		}

		// Backspace (\x7f or \x08)
		if (code === 127 || code === 8) {
			onKey({ name: "backspace", ctrl: false, alt: false, shift: false, sequence: "\x7f" });
			i += 1;
			continue;
		}

		// Ctrl keys (code 1..26)
		if (code >= 1 && code <= 26) {
			const ctrlChar = String.fromCharCode(96 + code); // 1 -> 'a', 3 -> 'c', 6 -> 'f', etc.
			onKey({ name: ctrlChar, ctrl: true, alt: false, shift: false, sequence: ch });
			i += 1;
			continue;
		}

		// Normal printable character (including multi-byte UTF-8 Cyrillic/Russian/Symbols)
		const cp = rest.codePointAt(0);
		if (cp !== undefined) {
			const charStr = String.fromCodePoint(cp);
			if (cp >= 32 && cp !== 127) {
				onKey({ name: "", ctrl: false, alt: false, shift: false, sequence: charStr });
			}
			i += charStr.length;
			continue;
		}

		i += 1;
	}

	return "";
}

/**
 * Terminal wrapper: raw mode + direct raw byte/escape-sequence decoding
 * (cross-platform, handles F1-F10 / Ctrl / Alt / Mouse on Windows Terminal & VT).
 */
export class Terminal {
	private raw = false;
	private keyHandler?: (key: KeyEvent) => void;
	private mouseHandler?: (mouse: MouseEvent) => void;
	private resizeHandler?: () => void;
	private dataListener?: (chunk: Buffer) => void;
	private inputBuffer = "";
	private escTimer: NodeJS.Timeout | null = null;

	enter(): void {
		if (!process.stdin.isTTY) {
			throw new Error("turbo-ai requires an interactive terminal (TTY).");
		}
		process.stdin.setRawMode(true);
		process.stdin.resume();
		this.raw = true;

		// Enable SGR mouse tracking: clicks, drags, wheel events
		process.stdout.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");

		this.dataListener = (chunk: Buffer) => {
			if (this.escTimer) {
				clearTimeout(this.escTimer);
				this.escTimer = null;
			}
			this.inputBuffer += chunk.toString("utf8");
			this.inputBuffer = processInputBuffer(
				this.inputBuffer,
				(key) => this.keyHandler?.(key),
				(mouse) => this.mouseHandler?.(mouse),
			);
			if (this.inputBuffer === "\x1b") {
				this.escTimer = setTimeout(() => {
					if (this.inputBuffer === "\x1b") {
						this.inputBuffer = "";
						this.keyHandler?.({ name: "escape", ctrl: false, alt: false, shift: false, sequence: "\x1b" });
					}
				}, 50);
			}
		};

		process.stdin.on("data", this.dataListener);
		process.stdout.on("resize", () => this.resizeHandler?.());
	}

	leave(): void {
		const resetSeq = "\x1b[0m\x1b[?25h\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l\x1b[2J\x1b[H";
		try {
			process.stdout.write(resetSeq);
		} catch {
			/* stdout may already be closed */
		}

		if (this.escTimer) {
			clearTimeout(this.escTimer);
			this.escTimer = null;
		}

		if (this.dataListener) {
			process.stdin.removeListener("data", this.dataListener);
		}

		try {
			if (this.raw) process.stdin.setRawMode(false);
		} catch {
			/* stdin may already be closed */
		}
		this.raw = false;
		process.stdin.pause();
	}

	onKey(fn: (key: KeyEvent) => void): void {
		this.keyHandler = fn;
	}

	onMouse(fn: (mouse: MouseEvent) => void): void {
		this.mouseHandler = fn;
	}

	onResize(fn: () => void): void {
		this.resizeHandler = fn;
	}

	write(data: string): void {
		process.stdout.write(data);
	}

	size(): { cols: number; rows: number } {
		return {
			cols: process.stdout.columns ?? 80,
			rows: process.stdout.rows ?? 24,
		};
	}
}
