/** DOS/VGA 16-color palette indices, matching the classic IBM PC / Borland text-mode attribute layout. */
export enum DosColor {
	BLACK = 0,
	BLUE = 1,
	GREEN = 2,
	CYAN = 3,
	RED = 4,
	MAGENTA = 5,
	BROWN = 6,
	LIGHTGRAY = 7,
	DARKGRAY = 8,
	LIGHTBLUE = 9,
	LIGHTGREEN = 10,
	LIGHTCYAN = 11,
	LIGHTRED = 12,
	LIGHTMAGENTA = 13,
	YELLOW = 14,
	WHITE = 15,
}

const D = DosColor;

/**
 * Turbo Pascal 7.0 style theme.
 * All colors map to the classic DOS/VGA 16-color palette.
 */
export const THEME = {
	desktop: { fg: D.LIGHTGRAY, bg: D.BLUE },
	titleText: { fg: D.WHITE, bg: D.BLUE },
	activeFrame: { fg: D.WHITE, bg: D.BLUE },
	inactiveFrame: { fg: D.LIGHTGRAY, bg: D.BLUE },
	panelFrame: { fg: D.LIGHTGRAY, bg: D.BLUE },
	panelTitle: { fg: D.WHITE, bg: D.BLUE },
	panelTitleActive: { fg: D.YELLOW, bg: D.BLUE },
	windowCloseBox: { fg: D.LIGHTGREEN, bg: D.BLUE },
	windowZoomBox: { fg: D.LIGHTCYAN, bg: D.BLUE },
	windowScrollTrack: { fg: D.LIGHTBLUE, bg: D.BLUE },
	windowScrollThumb: { fg: D.WHITE, bg: D.BLUE },
	windowScrollArrow: { fg: D.LIGHTCYAN, bg: D.BLUE },
	windowLineCounter: { fg: D.WHITE, bg: D.BLUE },

	menuBar: { fg: D.BLACK, bg: D.LIGHTGRAY },
	menuBarMnemonic: { fg: D.RED, bg: D.LIGHTGRAY },
	menuActive: { fg: D.BLACK, bg: D.GREEN },
	menuActiveMnemonic: { fg: D.RED, bg: D.GREEN },
	menuBox: { fg: D.BLACK, bg: D.LIGHTGRAY },
	menuItem: { fg: D.BLACK, bg: D.LIGHTGRAY },
	menuItemMnemonic: { fg: D.RED, bg: D.LIGHTGRAY },
	menuHighlight: { fg: D.BLACK, bg: D.GREEN },
	menuHighlightMnemonic: { fg: D.RED, bg: D.GREEN },
	menuShortcut: { fg: D.DARKGRAY, bg: D.LIGHTGRAY },
	menuHighlightShortcut: { fg: D.BLACK, bg: D.GREEN },
	menuSeparator: { fg: D.DARKGRAY, bg: D.LIGHTGRAY },

	dialogFrame: { fg: D.BLACK, bg: D.LIGHTGRAY },
	dialogTitle: { fg: D.BLACK, bg: D.LIGHTGRAY },
	dialogText: { fg: D.BLACK, bg: D.LIGHTGRAY },
	dialogInput: { fg: D.WHITE, bg: D.BLUE },
	dialogInputFocused: { fg: D.YELLOW, bg: D.BLUE },
	dialogButton: { fg: D.BLACK, bg: D.GREEN },
	dialogButtonActive: { fg: D.WHITE, bg: D.GREEN },
	dialogButtonOkK: { fg: D.YELLOW, bg: D.GREEN },

	statusBar: { fg: D.BLACK, bg: D.LIGHTGRAY },
	statusBarHint: { fg: D.BLACK, bg: D.LIGHTGRAY },
	keyBarKey: { fg: D.RED, bg: D.LIGHTGRAY },
	keyBarText: { fg: D.BLACK, bg: D.LIGHTGRAY },
	keyBarDivider: { fg: D.DARKGRAY, bg: D.LIGHTGRAY },
	shadow: { fg: D.DARKGRAY, bg: D.BLACK },

	inputFrame: { fg: D.WHITE, bg: D.BLUE },
	inputFrameInactive: { fg: D.LIGHTGRAY, bg: D.BLUE },
	inputText: { fg: D.WHITE, bg: D.BLUE },
	inputPrompt: { fg: D.YELLOW, bg: D.BLUE },

	treeDir: { fg: D.WHITE, bg: D.BLUE },
	treeFile: { fg: D.LIGHTGRAY, bg: D.BLUE },
	treeSelected: { fg: D.WHITE, bg: D.DARKGRAY },
	treeSelectedActive: { fg: D.BLACK, bg: D.GREEN },
	treeGitDirty: { fg: D.YELLOW, bg: D.BLUE },

	userLabel: { fg: D.YELLOW, bg: D.BLUE },
	userText: { fg: D.WHITE, bg: D.BLUE },
	agentLabel: { fg: D.LIGHTCYAN, bg: D.BLUE },
	agentText: { fg: D.WHITE, bg: D.BLUE },
	agentKeyword: { fg: D.YELLOW, bg: D.BLUE },
	agentComment: { fg: D.DARKGRAY, bg: D.BLUE },
	agentString: { fg: D.LIGHTCYAN, bg: D.BLUE },
	agentNumber: { fg: D.LIGHTMAGENTA, bg: D.BLUE },

	toolTag: { fg: D.LIGHTCYAN, bg: D.BLUE },
	toolTagRead: { fg: D.LIGHTCYAN, bg: D.BLUE },
	toolTagWrite: { fg: D.YELLOW, bg: D.BLUE },
	toolTagBash: { fg: D.LIGHTMAGENTA, bg: D.BLUE },
	toolTagOk: { fg: D.LIGHTGREEN, bg: D.BLUE },
	toolTagErr: { fg: D.LIGHTRED, bg: D.BLUE },
	toolTagRun: { fg: D.YELLOW, bg: D.BLUE },
	errorText: { fg: D.LIGHTRED, bg: D.BLUE },
	successText: { fg: D.LIGHTGREEN, bg: D.BLUE },
	dimText: { fg: D.DARKGRAY, bg: D.BLUE },
	thinkingText: { fg: D.LIGHTGRAY, bg: D.BLUE },
	thinkingBadge: { fg: D.YELLOW, bg: D.BLACK },

	// Message-type shading: LIGHTBLUE backgrounds mark live/active rows (pi TUI
	// toolPendingBg role), DARKGRAY dims settled tool output (toolOutput role).
	thinkingLive: { fg: D.BLACK, bg: D.LIGHTBLUE },
	toolPending: { fg: D.BLACK, bg: D.LIGHTBLUE },
	toolResultText: { fg: D.DARKGRAY, bg: D.BLUE },

	diffMinus: { fg: D.LIGHTRED, bg: D.BLUE },
	diffPlus: { fg: D.LIGHTGREEN, bg: D.BLUE },
	diffHunk: { fg: D.LIGHTCYAN, bg: D.BLUE },
	diffContext: { fg: D.LIGHTGRAY, bg: D.BLUE },

	helpText: { fg: D.LIGHTGRAY, bg: D.BLUE },
	helpKey: { fg: D.YELLOW, bg: D.BLUE },
	helpDialogText: { fg: D.BLACK, bg: D.LIGHTGRAY },
	helpDialogKey: { fg: D.RED, bg: D.LIGHTGRAY },

	selection: { fg: D.BLACK, bg: D.CYAN },
	inputSelection: { fg: D.BLACK, bg: D.CYAN },
} as const;

export interface ColorAttr {
	fg: DosColor;
	bg: DosColor;
}

/** Pack a color pair into a single byte attribute (fg low nibble, bg high nibble). */
export function packAttr(a: ColorAttr): number {
	return (a.fg & 15) | ((a.bg & 15) << 4);
}

/**
 * Mapping from DOS color indices (0..15) to ANSI SGR color numbers.
 * DOS index: 0=Black, 1=Blue, 2=Green, 3=Cyan, 4=Red, 5=Magenta, 6=Brown, 7=LightGray,
 *            8=DarkGray, 9=LightBlue, 10=LightGreen, 11=LightCyan, 12=LightRed, 13=LightMagenta, 14=Yellow, 15=White.
 */
const DOS_TO_ANSI_FG = [30, 34, 32, 36, 31, 35, 33, 37, 90, 94, 92, 96, 91, 95, 93, 97];
const DOS_TO_ANSI_BG = [40, 44, 42, 46, 41, 45, 43, 47, 100, 104, 102, 106, 101, 105, 103, 107];

function sgrFg(color: number): string {
	const code = DOS_TO_ANSI_FG[color & 15] ?? 37;
	return `\x1b[${code}m`;
}

function sgrBg(color: number): string {
	const code = DOS_TO_ANSI_BG[color & 15] ?? 40;
	return `\x1b[${code}m`;
}

/** Build the SGR sequence that selects the given packed attribute. */
export function sgrFor(attr: number): string {
	return sgrFg(attr & 15) + sgrBg((attr >> 4) & 15);
}

export const ANSI_RESET = "\x1b[0m";
