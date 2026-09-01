export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Layout {
	menuBar: Rect;
	desktop: Rect;
	projectPane: Rect;
	agentPane: Rect;
	inputLine: Rect;
	keyBar: Rect;
	cols: number;
	rows: number;
}

const MIN_COLS = 60;
const MIN_ROWS = 18;

export function minSize(): { cols: number; rows: number } {
	return { cols: MIN_COLS, rows: MIN_ROWS };
}

/**
 * Compute pane rectangles for a given terminal size.
 *
 * Classic Turbo Pascal tiled window layout:
 * - Row 0: Menu bar (h = 1)
 * - Rows 1 .. rows-2: Desktop area (h = rows - 2)
 *   * Left: Project Tree pane (x = 0, w = treeW, h = rows - 2)
 *   * Right Top: Agent Output pane (x = treeW, w = cols - treeW, h = rows - 2 - 3)
 *   * Right Bottom: Message/Prompt Input window (x = treeW, w = cols - treeW, h = 3)
 * - Row rows-1: Key bar / Hint bar (h = 1)
 */
export function computeLayout(cols: number, rows: number, inputHeight = 3): Layout | null {
	if (cols < MIN_COLS || rows < MIN_ROWS) return null;
	const menuBar: Rect = { x: 0, y: 0, w: cols, h: 1 };
	const keyBar: Rect = { x: 0, y: rows - 1, w: cols, h: 1 };
	const desktopY = 1;
	const desktopH = rows - 2;
	const desktop: Rect = { x: 0, y: desktopY, w: cols, h: desktopH };

	const treeW = Math.min(38, Math.max(20, Math.round(cols * 0.28)));
	const rightW = cols - treeW;

	// Clamp input window height between 3 and half screen rows (rows / 2)
	const maxInputH = Math.max(3, Math.floor(rows / 2));
	const actualInputH = Math.max(3, Math.min(maxInputH, inputHeight));
	const agentH = Math.max(3, desktopH - actualInputH);
	const inputY = desktopY + agentH;

	const projectPane: Rect = { x: 0, y: desktopY, w: treeW, h: desktopH };
	const agentPane: Rect = { x: treeW, y: desktopY, w: rightW, h: agentH };
	const inputLine: Rect = { x: treeW, y: inputY, w: rightW, h: actualInputH };

	return { menuBar, desktop, projectPane, agentPane, inputLine, keyBar, cols, rows };
}

/** Width of the input window's text area for a given terminal columns. */
export function inputTextWidth(cols: number): number {
	const treeW = Math.min(38, Math.max(20, Math.round(cols * 0.28)));
	const rightW = cols - treeW;
	return Math.max(1, rightW - 6);
}

/** Interior area of a bordered rect (shrunk by the frame). */
export function inner(r: Rect): Rect {
	return { x: r.x + 1, y: r.y + 1, w: Math.max(0, r.w - 2), h: Math.max(0, r.h - 2) };
}

/** Center a rect of the given size inside a terminal of cols x rows. */
export function centerRect(cols: number, rows: number, w: number, h: number): Rect {
	w = Math.min(w, cols);
	h = Math.min(h, rows);
	return {
		x: Math.max(0, Math.floor((cols - w) / 2)),
		y: Math.max(0, Math.floor((rows - h) / 2)),
		w,
		h,
	};
}

export function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

/** Format a token count like the TP-style status bar expects: 18.4k */
/** Format a token count like the TP-style status bar expects: 18.4k */
export function formatTokens(n: number | null | undefined): string | null {
	if (n === null || n === undefined || !Number.isFinite(n)) return null;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k tokens`;
	return `${Math.round(n)} tokens`;
}

export function isInRect(x: number, y: number, rect: Rect): boolean {
	return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}
