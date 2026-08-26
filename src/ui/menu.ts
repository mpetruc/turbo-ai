export interface MenuItem {
	label?: string;
	/** Keyboard shortcut shown right-aligned, e.g. "F2" or "Alt+X". */
	shortcut?: string;
	/** Action id dispatched by the app when selected. */
	action?: string;
	separator?: boolean;
	enabled?: boolean;
	/** Hotkey mnemonic letter (e.g. 'N', 'X', 'C'). */
	mnemonic?: string;
	/** Contextual help hint displayed in the status bar when highlighted. */
	hint?: string;
}

export interface Menu {
	title: string;
	mnemonic?: string;
	hint?: string;
	items: MenuItem[];
}

/**
 * Stateful dropdown navigation (pure, no terminal access — unit-testable).
 */
export class MenuState {
	index = 0;
	constructor(readonly menu: Menu) {}

	get selectable(): number[] {
		const out: number[] = [];
		this.menu.items.forEach((it, i) => {
			if (!it.separator && it.enabled !== false) out.push(i);
		});
		return out;
	}

	move(delta: number): void {
		const sel = this.selectable;
		if (sel.length === 0) return;
		const pos = sel.indexOf(this.index);
		const next = pos === -1 ? 0 : (pos + delta + sel.length) % sel.length;
		this.index = sel[next] ?? this.index;
	}

	selectFirst(): void {
		const sel = this.selectable;
		this.index = sel.length > 0 ? (sel[0] ?? 0) : 0;
	}

	current(): MenuItem | null {
		return this.menu.items[this.index] ?? null;
	}

	findByMnemonic(ch: string): number | null {
		const target = ch.toLowerCase();
		for (let i = 0; i < this.menu.items.length; i++) {
			const it = this.menu.items[i];
			if (!it || it.separator || it.enabled === false) continue;
			if (it.mnemonic?.toLowerCase() === target) return i;
			if (!it.mnemonic && it.label) {
				const firstChar = it.label.trim().charAt(0).toLowerCase();
				if (firstChar === target) return i;
			}
		}
		return null;
	}
}

/** Width of a dropdown box needed for a menu (borders + shortcut column). */
export function menuWidth(menu: Menu): number {
	let maxLabel = menu.title.length;
	let maxShortcut = 0;
	for (const it of menu.items) {
		if (!it.label) continue;
		maxLabel = Math.max(maxLabel, it.label.length);
		if (it.shortcut) maxShortcut = Math.max(maxShortcut, it.shortcut.length);
	}
	return Math.max(maxLabel + maxShortcut + 6, 24);
}

export function menuHeight(menu: Menu): number {
	return menu.items.length + 2;
}
