import type { KeyEvent } from "./terminal.js";

export type AppAction =
	| { kind: "char"; ch: string }
	| { kind: "backspace" }
	| { kind: "enter" }
	| { kind: "newline" }
	| { kind: "esc" }
	| { kind: "up" }
	| { kind: "down" }
	| { kind: "left" }
	| { kind: "right" }
	| { kind: "pageup" }
	| { kind: "pagedown" }
	| { kind: "home" }
	| { kind: "end" }
	| { kind: "delete" }
	| { kind: "tab" }
	| { kind: "help" } // F1
	| { kind: "saveSession" } // F2
	| { kind: "openSession" } // F3
	| { kind: "model" } // F4
	| { kind: "effort" } // F5
	| { kind: "mode" } // F6
	| { kind: "diff" } // F7
	| { kind: "tests" } // F8
	| { kind: "build" } // F9
	| { kind: "menu" } // F10
	| { kind: "run" } // run command
	| { kind: "files" }
	| { kind: "agent" }
	| { kind: "git" }
	| { kind: "save" } // Ctrl+S
	| { kind: "find" } // Ctrl+F
	| { kind: "clearView" } // Ctrl+L
	| { kind: "cancel" } // Ctrl+C
	| { kind: "exit" } // Alt+X
	| { kind: "openMenu"; menu: string } // Alt+F, Alt+E, etc.
	| { kind: "ignored" };

const FNAMES: Record<string, AppAction["kind"]> = {
	f1: "help",
	f2: "saveSession",
	f3: "openSession",
	f4: "model",
	f5: "effort",
	f6: "mode",
	f7: "diff",
	f8: "tests",
	f9: "build",
	f10: "menu",
};

const ALT_MENUS: Record<string, string> = {
	f: "file",
	e: "edit",
	s: "search",
	r: "run",
	a: "agent",
	g: "git",
	t: "tools",
	w: "window",
	h: "help",
};

/** Pure keyboard -> action mapping. Testable without a terminal. */
export function mapKey(key: KeyEvent): AppAction {
	const fname = key.name ? FNAMES[key.name] : undefined;
	if (fname) return { kind: fname } as AppAction;

	if (key.ctrl) {
		switch (key.name) {
			case "s":
				return { kind: "save" };
			case "f":
				return { kind: "find" };
			case "l":
				return { kind: "clearView" };
			case "c":
				return { kind: "cancel" };
			default:
				return { kind: "ignored" };
		}
	}

	if (key.alt) {
		if (key.name === "x") return { kind: "exit" };
		if (key.name === "return" || key.name === "enter") return { kind: "newline" };
		const menuName = key.name ? ALT_MENUS[key.name] : undefined;
		if (menuName) return { kind: "openMenu", menu: menuName };
	}

	if (key.ctrl && (key.name === "j" || key.name === "return" || key.name === "enter")) {
		return { kind: "newline" };
	}

	switch (key.name) {
		case "return":
		case "enter":
			if (key.shift) return { kind: "newline" };
			return { kind: "enter" };
		case "escape":
			return { kind: "esc" };
		case "up":
			return { kind: "up" };
		case "down":
			return { kind: "down" };
		case "left":
			return { kind: "left" };
		case "right":
			return { kind: "right" };
		case "pageup":
			return { kind: "pageup" };
		case "pagedown":
			return { kind: "pagedown" };
		case "home":
			return { kind: "home" };
		case "end":
			return { kind: "end" };
		case "delete":
			return { kind: "delete" };
		case "backspace":
			return { kind: "backspace" };
		case "tab":
			return { kind: "tab" };
	}

	// Printable character (no ctrl/alt modifiers)
	if (!key.ctrl && !key.alt && key.sequence && key.sequence.length > 0) {
		const ch = key.sequence;
		const code = ch.codePointAt(0) ?? 0;
		if (code >= 32 && code !== 127) {
			return { kind: "char", ch };
		}
	}
	return { kind: "ignored" };
}
