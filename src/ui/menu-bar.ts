import { packAttr, THEME } from "../theme/turbo-pascal.js";
import type { Screen } from "./screen.js";
import { MenuState, type Menu, menuHeight, menuWidth } from "./menu.js";

export const MAIN_MENUS: Menu[] = [
	{
		title: "File",
		mnemonic: "F",
		hint: "File management commands (Save, Open, New session, Preview, Change dir, Export, Exit)",
		items: [
			{ label: "Save session to file...", mnemonic: "S", shortcut: "F2", action: "file.save", hint: "Save current conversation log to a file" },
			{ label: "Open saved session...", mnemonic: "O", shortcut: "F3", action: "file.open", hint: "Open and load a saved session file" },
			{ label: "New session", mnemonic: "N", action: "file.new", hint: "Start a new session with the Pi coding agent" },
			{ label: "Open file preview...", mnemonic: "P", action: "file.preview", hint: "Preview selected file from project explorer" },
			{ label: "Change directory...", mnemonic: "D", action: "file.chdir", hint: "Change active working directory and reload project" },
			{ label: "Export session to HTML...", mnemonic: "E", action: "file.export", hint: "Export conversation transcript to HTML document" },
			{ separator: true },
			{ label: "Exit", mnemonic: "x", shortcut: "Alt+X", action: "app.exit", hint: "Exit Turbo-AI and return to DOS / shell" },
		],
	},
	{
		title: "Edit",
		mnemonic: "E",
		hint: "Text editing and view commands (Clear input, Clear agent log, Find in tree)",
		items: [
			{ label: "Clear message input", mnemonic: "I", action: "edit.clearInput", hint: "Clear current text in the prompt input line" },
			{ label: "Clear agent log", mnemonic: "C", shortcut: "Ctrl+L", action: "view.clear", hint: "Clear agent message history from screen" },
			{ separator: true },
			{ label: "Copy last answer...", mnemonic: "L", action: "edit.lastAnswer", hint: "Inspect clean text of the last assistant reply" },
			{ label: "Find in file tree...", mnemonic: "F", shortcut: "Ctrl+F", action: "search.find", hint: "Filter files in the project tree" },
			{ label: "Reset file filter", mnemonic: "R", action: "search.clear", hint: "Clear file tree filter and show all files" },
		],
	},
	{
		title: "Search",
		mnemonic: "S",
		hint: "Search and filter files in workspace",
		items: [
			{ label: "Find file by name...", mnemonic: "F", shortcut: "Ctrl+F", action: "search.find", hint: "Filter and find files in the project tree" },
			{ label: "Search text in files...", mnemonic: "T", action: "search.grep", hint: "Grep search text pattern across workspace files via Pi" },
			{ separator: true },
			{ label: "Clear search filter", mnemonic: "C", action: "search.clear", hint: "Reset active search filter in project tree" },
		],
	},
	{
		title: "Run",
		mnemonic: "R",
		hint: "Execute commands, tests, build and abort operations",
		items: [
			{ label: "Run command...", mnemonic: "R", action: "run.command", hint: "Execute custom command in agent bash tool" },
			{ label: "Run test suite", mnemonic: "T", shortcut: "F8", action: "run.tests", hint: "Run project test suite (npm test)" },
			{ label: "Build project", mnemonic: "B", shortcut: "F9", action: "run.build", hint: "Build project artifacts (npm run build)" },
			{ separator: true },
			{ label: "Abort command", mnemonic: "A", shortcut: "Ctrl+C", action: "run.abort", hint: "Cancel running shell / bash command" },
		],
	},
	{
		title: "Agent",
		mnemonic: "A",
		hint: "Pi agent control, model selection, reasoning effort, and plan/build modes",
		items: [
			{ label: "Select model...", mnemonic: "M", shortcut: "F4", action: "tools.model", hint: "Choose active LLM model provider and identifier" },
			{ label: "Thinking effort...", mnemonic: "E", shortcut: "F5", action: "agent.thinking", hint: "Cycle reasoning effort (off -> low -> medium -> high)" },
			{ label: "Plan / Build mode...", mnemonic: "P", shortcut: "F6", action: "agent.mode", hint: "Toggle between PLAN and BUILD execution modes" },
			{ separator: true },
			{ label: "Cycle to next model", mnemonic: "C", action: "agent.cycle", hint: "Quickly toggle to the next enabled LLM model" },
			{ label: "Compact context memory", mnemonic: "K", action: "agent.compact", hint: "Summarize conversation to free context window tokens" },
			{ label: "Fork session branch...", mnemonic: "F", action: "agent.fork", hint: "Create a new branch from an earlier user message" },
			{ label: "Clone active branch", mnemonic: "L", action: "agent.clone", hint: "Duplicate active conversation branch into a new session" },
			{ separator: true },
			{ label: "Abort agent generation", mnemonic: "A", shortcut: "Ctrl+C", action: "agent.abort", hint: "Abort ongoing LLM generation or tool execution" },
		],
	},
	{
		title: "Git",
		mnemonic: "G",
		hint: "Git version control operations (Status, Diff, History, Refresh)",
		items: [
			{ label: "Diff working tree...", mnemonic: "D", shortcut: "F7", action: "git.diff", hint: "View unified git diff of working tree changes" },
			{ label: "Status...", mnemonic: "S", action: "git.status", hint: "Show git repository branch and modified files" },
			{ label: "Commit history...", mnemonic: "L", action: "git.log", hint: "View recent git commits log in a popup" },
			{ separator: true },
			{ label: "Refresh git status", mnemonic: "R", action: "git.refresh", hint: "Rescan git status and dirty file markers" },
		],
	},
	{
		title: "Tools",
		mnemonic: "T",
		hint: "Session statistics, session rename, and environment metrics",
		items: [
			{ label: "Session statistics...", mnemonic: "S", action: "tools.stats", hint: "Display token usage, context usage, and cost" },
			{ label: "Rename session...", mnemonic: "N", action: "tools.rename", hint: "Set a custom display name for the current session" },
			{ separator: true },
			{ label: "Refresh project tree", mnemonic: "R", action: "tree.refresh", hint: "Rescan project directory for new/deleted files" },
			{ label: "Environment & system info...", mnemonic: "E", action: "tools.env", hint: "Show Node.js, OS, memory, PID and terminal info" },
		],
	},
	{
		title: "Options",
		mnemonic: "O",
		hint: "Pi agent settings, API keys, custom models, and delivery modes",
		items: [
			{ label: "Configure API keys & providers...", mnemonic: "K", action: "opt.keys", hint: "Set API keys for OpenRouter, DeepSeek, Google, Anthropic, OpenAI" },
			{ label: "Add custom model...", mnemonic: "M", action: "opt.addModel", hint: "Register a new custom model in models.json" },
			{ label: "Reload models list", mnemonic: "L", action: "opt.reloadModels", hint: "Rescan and reload all available models from Pi" },
			{ separator: true },
			{ label: "Auto-compaction on/off", mnemonic: "A", action: "opt.compaction", hint: "Toggle automatic context compaction when memory fills" },
			{ label: "Auto-retry on error", mnemonic: "R", action: "opt.retry", hint: "Toggle automatic retry on transient network/API errors" },
			{ separator: true },
			{ label: "Steering delivery mode...", mnemonic: "S", action: "opt.steering", hint: "Toggle steer delivery mode (one-at-a-time / all)" },
			{ label: "Follow-up delivery mode...", mnemonic: "F", action: "opt.followUp", hint: "Toggle follow-up delivery mode (one-at-a-time / all)" },
		],
	},
	{
		title: "Window",
		mnemonic: "W",
		hint: "Window navigation, zooming, and layout arrangement",
		items: [
			{ label: "Next pane", mnemonic: "N", shortcut: "Tab", action: "window.next", hint: "Switch active window (Files / Agent / Message)" },
			{ label: "Zoom / Restore window", mnemonic: "Z", action: "window.zoom", hint: "Toggle active window between tiled and full screen" },
			{ separator: true },
			{ label: "Project files", mnemonic: "P", action: "window.files", hint: "Focus project file explorer window (FILES.PAS)" },
			{ label: "Agent output", mnemonic: "A", action: "window.agent", hint: "Focus agent message log window (AGENT.PAS)" },
			{ label: "Message input", mnemonic: "M", action: "window.input", hint: "Focus message prompt input window (MESSAGE)" },
			{ separator: true },
			{ label: "Tile windows", mnemonic: "T", action: "window.tile", hint: "Restore standard 3-pane tiled desktop layout" },
		],
	},
	{
		title: "Help",
		mnemonic: "H",
		hint: "Help system, key reference and About dialog",
		items: [
			{ label: "Keyboard help...", mnemonic: "H", shortcut: "F1", action: "help.show", hint: "Display list of hotkeys and shortcuts" },
			{ label: "Pi & IDE Guide...", mnemonic: "G", action: "help.guide", hint: "Comprehensive guide to Turbo-AI and Pi features" },
			{ separator: true },
			{ label: "About...", mnemonic: "A", action: "help.about", hint: "Information about Turbo AI tribute and version" },
		],
	},
];

export class MenuBar {
	openIndex: number | null = null;
	private recentSessions: string[] = [];

	setRecentSessions(sessions: string[]): void {
		this.recentSessions = sessions.slice(0, 9);
	}

	getMenu(index: number): Menu | null {
		const baseMenu = MAIN_MENUS[index];
		if (!baseMenu) return null;
		if (index === 0 && this.recentSessions.length > 0) {
			const items = [...baseMenu.items];
			items.push({ separator: true });
			this.recentSessions.slice(0, 9).forEach((session, i) => {
				const num = i + 1;
				items.push({
					label: `${num}. ${session}`,
					mnemonic: String(num),
					action: `file.recent:${session}`,
					hint: `Open recent session: ${session}`,
				});
			});
			return {
				...baseMenu,
				items,
			};
		}
		return baseMenu;
	}

	render(screen: Screen, y: number, cols: number): void {
		const barAttr = packAttr(THEME.menuBar);
		screen.fill(0, y, cols, 1, barAttr);
		let x = 1;

		MAIN_MENUS.forEach((m, i) => {
			const active = i === this.openIndex;
			const itemAttr = packAttr(active ? THEME.menuActive : THEME.menuBar);
			const mnemAttr = packAttr(active ? THEME.menuActiveMnemonic : THEME.menuBarMnemonic);

			screen.setCell(x, y, " ", itemAttr);
			x++;

			// Render title with highlighted mnemonic letter
			const mnemChar = (m.mnemonic ?? m.title.charAt(0)).toLowerCase();
			let mnemFound = false;

			for (let ci = 0; ci < m.title.length; ci++) {
				const ch = m.title.charAt(ci);
				if (!mnemFound && ch.toLowerCase() === mnemChar) {
					screen.setCell(x, y, ch, mnemAttr);
					mnemFound = true;
				} else {
					screen.setCell(x, y, ch, itemAttr);
				}
				x++;
			}

			screen.setCell(x, y, " ", itemAttr);
			x += 2;
		});
	}

	getMenuX(index: number): number {
		let x = 1;
		for (let i = 0; i < index && i < MAIN_MENUS.length; i++) {
			const m = MAIN_MENUS[i];
			if (m) x += m.title.length + 3;
		}
		return x;
	}

	getMenuIndexAtX(clickX: number): number {
		let x = 1;
		for (let i = 0; i < MAIN_MENUS.length; i++) {
			const m = MAIN_MENUS[i];
			if (!m) continue;
			const width = m.title.length + 2; // " Title "
			if (clickX >= x && clickX < x + width) {
				return i;
			}
			x += width + 1;
		}
		return -1;
	}

	handleAction(kind: string): void {
		if (kind === "menu") {
			this.openIndex = this.openIndex === null ? 0 : null;
		} else if (kind === "left") {
			if (this.openIndex === null) return;
			this.openIndex = (this.openIndex + MAIN_MENUS.length - 1) % MAIN_MENUS.length;
		} else if (kind === "right") {
			if (this.openIndex === null) return;
			this.openIndex = (this.openIndex + 1) % MAIN_MENUS.length;
		}
	}

	currentMenu(): MenuState | null {
		if (this.openIndex === null) return null;
		const menu = this.getMenu(this.openIndex);
		if (!menu) return null;
		const st = new MenuState(menu);
		st.selectFirst();
		return st;
	}
}

export function renderDropdown(screen: Screen, state: MenuState, x: number, y: number): void {
	const menu = state.menu;
	const w = menuWidth(menu);
	const h = menuHeight(menu);

	const boxAttr = packAttr(THEME.menuBox);
	const hiAttr = packAttr(THEME.menuHighlight);
	const hiMnemAttr = packAttr(THEME.menuHighlightMnemonic);
	const itemMnemAttr = packAttr(THEME.menuItemMnemonic);
	const shAttr = packAttr(THEME.menuShortcut);
	const hiShAttr = packAttr(THEME.menuHighlightShortcut);
	const shadowAttr = packAttr(THEME.shadow);

	screen.shadow(x, y, w, h, shadowAttr);
	screen.box(x, y, w, h, boxAttr);

	menu.items.forEach((item, i) => {
		const ry = y + 1 + i;
		if (item.separator) {
			screen.setCell(x, ry, "\u251c", boxAttr);
			for (let cx = x + 1; cx < x + w - 1; cx++) {
				screen.setCell(cx, ry, "\u2500", boxAttr);
			}
			screen.setCell(x + w - 1, ry, "\u2524", boxAttr);
			return;
		}

		const selected = i === state.index;
		const rowAttr = selected ? hiAttr : boxAttr;
		const mnemAttr = selected ? hiMnemAttr : itemMnemAttr;
		const shortcutAttr = selected ? hiShAttr : shAttr;

		screen.fill(x + 1, ry, w - 2, 1, rowAttr);

		// Render item text with red mnemonic hotkey
		const label = item.label ?? "";
		const mnemChar = item.mnemonic?.toLowerCase() ?? "";
		let mnemFound = false;
		let tx = x + 2;

		for (let ci = 0; ci < label.length; ci++) {
			const ch = label.charAt(ci);
			if (!mnemFound && mnemChar && ch.toLowerCase() === mnemChar) {
				screen.setCell(tx, ry, ch, mnemAttr);
				mnemFound = true;
			} else {
				screen.setCell(tx, ry, ch, rowAttr);
			}
			tx++;
		}

		if (item.shortcut) {
			screen.text(x + w - 2 - item.shortcut.length, ry, item.shortcut, shortcutAttr);
		}
	});
}
