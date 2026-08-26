import * as fs from "node:fs";
import * as path from "node:path";
import { packAttr, THEME } from "../theme/turbo-pascal.js";
import { inner, type Rect } from "../utils/layout.js";
import type { Screen } from "./screen.js";

const IGNORED = new Set(["node_modules", ".git", "dist", ".next", "__pycache__", ".turbo", "coverage"]);

interface TreeNode {
	name: string;
	fullPath: string;
	isDir: boolean;
	expanded: boolean;
	dirty?: boolean; // modified per git status
	children: TreeNode[] | null; // null = not loaded yet
}

export class ProjectTree {
	private root: TreeNode | null = null;
	private flat: TreeNode[] = [];
	cursor = 0;
	filter: string | null = null;
	gitDirtyFiles: Set<string> = new Set();

	constructor(private baseDir: string) {}

	get selected(): TreeNode | null {
		return this.flat[this.cursor] ?? null;
	}

	setBaseDir(dir: string): void {
		this.baseDir = dir;
		this.cursor = 0;
		this.filter = null;
		this.reload();
	}

	reload(): void {
		this.root = this.buildNode(this.baseDir, this.baseDir, true);
		this.applyFilter();
	}

	setFilter(filter: string | null): void {
		this.filter = filter && filter.trim() ? filter.trim().toLowerCase() : null;
		this.applyFilter();
	}

	private buildNode(dirPath: string, name: string, expanded: boolean): TreeNode {
		return { name, fullPath: dirPath, isDir: true, expanded, children: null, dirty: false };
	}

	private ensureChildren(node: TreeNode): void {
		if (node.children) return;
		let entries: fs.Dirent[] = [];
		try {
			entries = fs.readdirSync(node.fullPath, { withFileTypes: true });
		} catch {
			node.children = [];
			return;
		}
		const nodes: TreeNode[] = [];
		for (const e of entries) {
			if (e.name.startsWith(".") && e.name !== ".github") continue;
			if (IGNORED.has(e.name)) continue;
			const full = path.join(node.fullPath, e.name);
			if (e.isDirectory()) {
				nodes.push({ name: e.name, fullPath: full, isDir: true, expanded: false, children: null });
			} else if (e.isFile()) {
				nodes.push({
					name: e.name,
					fullPath: full,
					isDir: false,
					expanded: false,
					children: null,
					dirty: this.gitDirtyFiles.has(path.relative(this.baseDir, full).replace(/\\/g, "/")),
				});
			}
		}
		nodes.sort((a, b) => {
			if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		node.children = nodes;
	}

	private applyFilter(): void {
		this.flat = [];
		if (!this.root) return;
		const walk = (node: TreeNode, depth: number) => {
			this.flat.push(node);
			if (!node.isDir || !node.expanded) return;
			this.ensureChildren(node);
			for (const child of node.children ?? []) {
				if (this.filter && !child.isDir && !child.name.toLowerCase().includes(this.filter)) continue;
				walk(child, depth + 1);
			}
		};
		walk(this.root, 0);
		if (this.cursor >= this.flat.length) this.cursor = Math.max(0, this.flat.length - 1);
	}

	setGitStatus(dirtyRelPaths: string[]): void {
		this.gitDirtyFiles = new Set(dirtyRelPaths.map((p) => p.replace(/\\/g, "/")));
		this.reload();
	}

	handleKey(kind: string): "expand" | "collapse" | "toggle" | "open-file" | "none" {
		switch (kind) {
			case "up":
				if (this.cursor > 0) this.cursor--;
				return "none";
			case "down":
				if (this.cursor < this.flat.length - 1) this.cursor++;
				return "none";
			case "pageup":
				this.cursor = Math.max(0, this.cursor - 10);
				return "none";
			case "pagedown":
				this.cursor = Math.min(Math.max(0, this.flat.length - 1), this.cursor + 10);
				return "none";
			case "home":
				this.cursor = 0;
				return "none";
			case "end":
				this.cursor = Math.max(0, this.flat.length - 1);
				return "none";
			case "enter": {
				const node = this.selected;
				if (!node) return "none";
				if (node.isDir) {
					node.expanded = !node.expanded;
					this.applyFilter();
					return node.expanded ? "expand" : "collapse";
				}
				return "open-file";
			}
			default:
				return "none";
		}
	}

	scrollOffset = 0;

	handleClick(visualRow: number): "expand" | "collapse" | "toggle" | "open-file" | "none" {
		const targetIndex = this.scrollOffset + visualRow;
		if (targetIndex >= 0 && targetIndex < this.flat.length) {
			if (this.cursor === targetIndex) {
				return this.handleKey("enter");
			}
			this.cursor = targetIndex;
			return "none";
		}
		return "none";
	}

	scrollToRatio(ratio: number): void {
		if (this.flat.length === 0) return;
		this.cursor = Math.max(0, Math.min(this.flat.length - 1, Math.round(ratio * (this.flat.length - 1))));
	}

	getThumbRow(trackH: number, visibleH: number): number {
		const maxOffset = Math.max(0, this.flat.length - visibleH);
		if (maxOffset <= 0 || trackH <= 0) return 0;
		const ratio = Math.max(0, Math.min(1, this.scrollOffset / maxOffset));
		return Math.min(trackH - 1, Math.floor(ratio * trackH));
	}

	render(screen: Screen, rect: Rect, focused: boolean, zoomed?: boolean): void {
		const frameAttr = packAttr(focused ? THEME.activeFrame : THEME.inactiveFrame);
		const titleAttr = packAttr(focused ? THEME.panelTitleActive : THEME.panelTitle);
		const filterText = this.filter ? ` [${this.filter}]` : "";
		const title = `FILES${filterText}${focused ? " \u25c4" : ""}`;

		screen.boxDouble(rect.x, rect.y, rect.w, rect.h, frameAttr, title, titleAttr, {
			closeBox: true,
			zoomBox: true,
			zoomed,
		});

		const area = inner(rect);
		screen.fill(area.x, area.y, area.w, area.h, packAttr({ fg: THEME.treeFile.fg, bg: THEME.desktop.bg }));
		if (area.w <= 0 || area.h <= 0) return;

		// Keep the cursor visible
		const maxOffset = Math.max(0, this.flat.length - area.h);
		const offset = Math.max(0, Math.min(this.cursor - Math.floor(area.h / 2), maxOffset));
		this.scrollOffset = offset;

		const dirAttr = packAttr(THEME.treeDir);
		const fileAttr = packAttr(THEME.treeFile);
		const selAttr = packAttr(focused ? THEME.treeSelectedActive : THEME.treeSelected);
		const dirtyMark = packAttr(THEME.treeGitDirty);

		for (let row = 0; row < area.h; row++) {
			const idx = offset + row;
			const node = this.flat[idx];
			if (!node) break;
			const depth = node.fullPath === this.baseDir ? 0 : node.fullPath.slice(this.baseDir.length + 1).split(/[\\/]/).length - 1;
			const indent = Math.min(depth * 2, Math.floor(area.w / 3));
			const marker = node.isDir ? (node.expanded ? "\u25bc" : "\u25ba") : " ";
			const name = `${marker} ${node.name}`;
			const isSelected = idx === this.cursor;
			const attr = isSelected ? selAttr : node.isDir ? dirAttr : fileAttr;

			if (isSelected) {
				screen.fill(area.x, area.y + row, area.w, 1, attr);
			}
			screen.textClipped(area.x + indent, area.y + row, name, area.w - indent, attr);
			if (node.dirty) {
				screen.setCell(area.x + area.w - 1, area.y + row, "*", isSelected ? selAttr : dirtyMark);
			}
		}

		// Vertical scrollbar on right border
		if (rect.h > 4) {
			screen.scrollbarV(
				rect.x + rect.w - 1,
				rect.y + 1,
				rect.h - 2,
				this.flat.length,
				area.h,
				offset,
				packAttr(THEME.windowScrollTrack),
				packAttr(THEME.windowScrollThumb),
				packAttr(THEME.windowScrollArrow),
			);
		}

		// Item counter on bottom border (e.g. " 1/24 ")
		const counterStr = ` ${this.flat.length > 0 ? this.cursor + 1 : 0}/${this.flat.length} `;
		if (rect.w >= counterStr.length + 6) {
			screen.text(rect.x + 2, rect.y + rect.h - 1, counterStr, packAttr(THEME.windowLineCounter));
		}
	}
}
