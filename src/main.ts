import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { packAttr, THEME } from "./theme/turbo-pascal.js";
import { centerRect, inner, computeLayout, isInRect, type Layout } from "./utils/layout.js";
import { PiClient } from "./rpc/pi-client.js";
import { eventToEntries, type AgentEntry } from "./rpc/events.js";
import { parseThinkingLevel, type ModelInfo, type RpcEvent, type RpcResponse, type SessionStateData, type SessionStatsData, type ThinkingLevel } from "./rpc/types.js";
import { Screen } from "./ui/screen.js";
import { MenuBar, MAIN_MENUS, renderDropdown } from "./ui/menu-bar.js";
import { MenuState, menuWidth, menuHeight } from "./ui/menu.js";
import { ProjectTree } from "./ui/project-tree.js";
import { AgentPanel } from "./ui/agent-panel.js";
import { InputLine } from "./ui/input-line.js";
import { renderStatusBar, renderKeyBar, getKeyBarSlotAtX, type StatusBarFields } from "./ui/status-bar.js";
import { ModelSelector } from "./ui/model-selector.js";
import { DiffViewer, parseUnifiedDiff } from "./ui/diff-viewer.js";
import { renderHelp, AboutDialog, helpRect, ABOUT_TEXT } from "./ui/help.js";
import { TextPopup } from "./ui/text-popup.js";
import { PromptDialog } from "./ui/prompt-dialog.js";
import { mapKey, type AppAction } from "./utils/keys.js";
import { CLI_USAGE, parseCliArgs } from "./utils/cli.js";
import { Terminal, type KeyEvent, type MouseEvent } from "./utils/terminal.js";
import { ProviderDialog, type ProviderEntry } from "./ui/provider-dialog.js";
import { AddModelDialog, type AddModelResult } from "./ui/add-model-dialog.js";
import { SessionSelector } from "./ui/session-selector.js";
import { collectGitInfo, copyToClipboard, filterEnabledModels, gitDiff, gitGrep, gitLog, getSystemInfo, readPreview, readEnvKey, writeEnvKey, saveCustomModel, setCustomModelReasoning, getProjectSessions, parseJsonlSession, type GitInfo } from "./commands/commands.js";

type Overlay =
	| { kind: "menu"; state: MenuState; x: number; y: number }
	| { kind: "model"; selector: ModelSelector }
	| { kind: "session"; selector: SessionSelector }
	| { kind: "help" }
	| { kind: "about"; dialog: AboutDialog }
	| { kind: "text"; popup: TextPopup }
	| { kind: "diff"; viewer: DiffViewer }
	| { kind: "prompt"; dialog: PromptDialog; onSubmit: (value: string) => void }
	| { kind: "providerConfig"; dialog: ProviderDialog }
	| { kind: "addModel"; dialog: AddModelDialog }
	| null;

export type WindowFocus = "input" | "agent" | "tree";

interface RecentSession {
	label: string;
	path: string;
	kind: "pi" | "transcript";
}

export class App {
	private screen = new Screen();
	private term = new Terminal();
	private client: PiClient;
	private menuBar = new MenuBar();
	private tree: ProjectTree;
	private panel = new AgentPanel();
	private input = new InputLine();
	private overlay: Overlay = null;

	constructor(public cwd: string, private readonly clientFactory: (cwd: string) => PiClient = (dir) => new PiClient({ cwd: dir })) {
		this.client = this.clientFactory(cwd);
		this.tree = new ProjectTree(cwd);
	}

	private layout: Layout | null = null;
	private focus: WindowFocus = "input";
	private isStreaming = false;
	private isBash = false;
	private model: string | null = null;
	private contextTokens: number | null = null;
	private gitInfo: GitInfo = { branch: null, added: null, removed: null, dirtyFiles: [], isRepo: false };
	private requestStart: number | null = null;
	private statusMessage: string | null = null;
	private statusMessageTimer: NodeJS.Timeout | null = null;
	private modelsCache: ModelInfo[] | null = null;
	private dirty = true;
	private closed = false;
	private sessionName: string | null = null;
	private sessionCounter = 0;
	private zoomedWindow: "tree" | "agent" | null = null;
	private spinnerTimer: NodeJS.Timeout | null = null;
	private activityTimer: NodeJS.Timeout | null = null;
	private gitPollTimer: NodeJS.Timeout | null = null;
	private spinnerFrame = 0;
	private static SPINNER_FRAMES = ["|", "/", "-", "\\"];

	private getEffectiveSessionName(): string {
		if (this.sessionName && this.sessionName.trim()) {
			return this.sessionName.trim();
		}
		const numStr = String(this.sessionCounter).padStart(2, "0");
		return `NONAME${numStr}.PAS`;
	}
	private activeDrag:
		| { kind: "agent"; trackY: number; trackH: number }
		| { kind: "input"; trackY: number; trackH: number }
		| { kind: "tree"; trackY: number; trackH: number }
		| { kind: "diff"; trackY: number; trackH: number }
		| { kind: "text"; trackY: number; trackH: number }
		| { kind: "model"; trackY: number; trackH: number }
		| { kind: "session"; trackY: number; trackH: number }
		| null = null;
	private activeSelection: { kind: "agent" | "input" | "text" | "diff" } | null = null;
	private planMode = false;
	private thinkingLevel: string | null = null;
	private recentSessions: RecentSession[] = [];
	private readonly clientEventHandler = (evt: RpcEvent): void => this.onRpcEvent(evt);
	private readonly clientResponseHandler = (resp: RpcResponse): void => this.onRpcResponse(resp);
	private readonly clientDisconnectedHandler = (): void => this.onDisconnected();
	private readonly processExitHandler = (): void => this.cleanup();
	private readonly sigintHandler = (): void => {
		this.cleanup();
		process.exit(130);
	};
	private readonly sigtermHandler = (): void => {
		this.cleanup();
		process.exit(143);
	};

	private addRecentSession(session: RecentSession): void {
		if (!session.label.trim() || !session.path.trim()) return;
		const normalizedPath = path.resolve(session.path).toLowerCase();
		this.recentSessions = [session, ...this.recentSessions.filter((s) => path.resolve(s.path).toLowerCase() !== normalizedPath)].slice(0, 9);
		this.menuBar.setRecentSessions(this.recentSessions.map((s) => s.label));
	}

	private startSpinner(): void {
		if (this.spinnerTimer) return;
		this.spinnerTimer = setInterval(() => {
			this.spinnerFrame = (this.spinnerFrame + 1) % App.SPINNER_FRAMES.length;
			this.markDirty();
		}, 80);
	}

	private stopSpinner(): void {
		if (this.spinnerTimer) {
			clearInterval(this.spinnerTimer);
			this.spinnerTimer = null;
		}
	}

	async run(): Promise<void> {
		this.panel.setStatus("Starting Pi agent in RPC mode...");
		try {
			await this.client.start();
		} catch (err) {
			console.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}
		this.term.enter();
		this.term.onResize(() => this.onResize());
		this.screen.start();
		this.refreshSize();
		this.tree.reload();

		this.bindClient(this.client);

		const stateResp = await this.getClientState(this.client);
		if (!stateResp.success || !stateResp.data) {
			this.fatal("ERROR: Unable to connect to Pi.");
			return;
		}
		if (stateResp.data.model) this.model = `${stateResp.data.model.provider}/${stateResp.data.model.id}`;
		if (stateResp.data.sessionName) this.sessionName = stateResp.data.sessionName;
		if (stateResp.data.thinkingLevel) this.thinkingLevel = stateResp.data.thinkingLevel;
		const initSession = this.getEffectiveSessionName();
		this.panel.setStatus(`Connected (${initSession}). Session: ${stateResp.data.sessionId ?? "(new)"}`);

		void this.pollStats();
		void this.pollGit();
		this.activityTimer = setInterval(() => {
			if (!this.closed && (this.isStreaming || this.isBash)) this.markDirty();
		}, 100);
		this.gitPollTimer = setInterval(() => {
			if (!this.closed) void this.pollGit();
		}, 10000);

		this.term.onKey((key) => this.onKey(key));
		this.term.onMouse((mouse) => this.onMouse(mouse));
		process.on("exit", this.processExitHandler);
		process.on("SIGINT", this.sigintHandler);
		process.on("SIGTERM", this.sigtermHandler);

		this.loop();
	}

	// ------------------------------------------------------------------ loop

	private loop(): void {
		const tick = () => {
			if (this.closed) return;
			if (this.dirty) {
				this.dirty = false;
				this.draw();
			}
			setImmediate(tick);
		};
		setImmediate(tick);
	}

	private markDirty(): void {
		this.dirty = true;
	}

	// ------------------------------------------------------------- rendering

	private refreshSize(): void {
		const { cols, rows } = this.term.size();
		const inputH = this.input.getRequiredHeight(rows);
		this.layout = computeLayout(cols, rows, inputH);
		this.screen.resize(cols, rows);
		this.markDirty();
	}

	private onResize(): void {
		this.refreshSize();
	}

	private statusFields(): StatusBarFields {
		let elapsedMs: number | null = null;
		if (this.requestStart !== null) elapsedMs = Date.now() - this.requestStart;
		else if ((this.isStreaming || this.isBash) === false) elapsedMs = null;
		const state = this.isStreaming ? "RUN" : this.isBash ? "BUILD" : this.planMode ? "PLAN" : "IDLE";
		return {
			model: this.model ?? "?",
			contextTokens: this.contextTokens,
			state,
			branch: this.gitInfo.branch,
			added: this.gitInfo.added,
			removed: this.gitInfo.removed,
			elapsedMs,
			message: this.statusMessage,
		};
	}

	private draw(): void {
		const { cols, rows } = this.term.size();
		const inputH = this.input.getRequiredHeight(rows);
		this.layout = computeLayout(cols, rows, inputH);
		const layout = this.layout;
		if (!layout) {
			const attr = packAttr(THEME.errorText);
			this.screen.fill(0, 0, this.screen.width, this.screen.height, packAttr(THEME.desktop));
			this.screen.text(1, 1, "Terminal too small. Need at least 60x18.", attr);
			this.screen.flush();
			return;
		}

		// Fill desktop with classic solid DOS Blue
		const desktopAttr = packAttr(THEME.desktop);
		this.screen.clear(desktopAttr);

		// Top Menu Bar
		this.menuBar.render(this.screen, 0, layout.cols);

		const isThinking = this.isStreaming || this.isBash;
		const elapsedMs = this.requestStart ? Math.max(0, Date.now() - this.requestStart) : 0;
		const thinking = isThinking ? { spinner: App.SPINNER_FRAMES[this.spinnerFrame] ?? "|", elapsedSec: elapsedMs / 1000 } : null;
		const sessionTitle = this.getEffectiveSessionName();

		let cursor: { x: number; y: number } | undefined;

		// Tiled or Zoomed Windows
		if (this.zoomedWindow === "agent") {
			this.panel.render(this.screen, layout.desktop, this.focus === "agent" && !this.overlay, true, thinking, sessionTitle);
		} else if (this.zoomedWindow === "tree") {
			this.tree.render(this.screen, layout.desktop, this.focus === "tree" && !this.overlay, true);
		} else {
			this.tree.render(this.screen, layout.projectPane, this.focus === "tree" && !this.overlay, false);
			this.panel.render(this.screen, layout.agentPane, this.focus === "agent" && !this.overlay, false, thinking, sessionTitle);
			const inputPos = this.input.render(
				this.screen,
				layout.inputLine,
				this.focus === "input" && !this.overlay,
				this.model,
				this.thinkingLevel,
				this.planMode,
			);
			if (this.focus === "input" && !this.overlay) {
				cursor = { x: inputPos.cursorX, y: inputPos.cursorY };
			}
		}

		// Contextual hint for bottom key bar (F1 Help │ <description>)
		let hint: string | null = null;
		if (this.overlay?.kind === "menu") {
			hint = this.overlay.state.current()?.hint ?? this.overlay.state.menu.hint ?? null;
		} else if (this.menuBar.openIndex !== null) {
			hint = MAIN_MENUS[this.menuBar.openIndex]?.hint ?? null;
		}

		// Bottom Key & Hint Bar (Turbo Pascal 7.0 single bottom line)
		renderKeyBar(this.screen, layout.keyBar.y, layout.cols, hint, this.statusMessage, thinking);

		// Overlays & Popups
		if (this.overlay) {
			switch (this.overlay.kind) {
				case "menu":
					renderDropdown(this.screen, this.overlay.state, this.overlay.x, this.overlay.y);
					break;
				case "model":
					this.overlay.selector.render(this.screen);
					break;
				case "session":
					this.overlay.selector.render(this.screen);
					break;
				case "help":
					renderHelp(this.screen);
					break;
				case "about":
					this.overlay.dialog.render(this.screen);
					break;
				case "text":
					this.overlay.popup.render(this.screen);
					break;
				case "diff":
					this.overlay.viewer.render(this.screen);
					break;
				case "prompt": {
					const pos = this.overlay.dialog.render(this.screen);
					cursor = { x: pos.cursorX, y: pos.cursorY };
					break;
				}
				case "providerConfig":
					this.overlay.dialog.render(this.screen);
					break;
				case "addModel": {
					const pos = this.overlay.dialog.render(this.screen);
					if (pos.cursorX !== undefined && pos.cursorX >= 0) {
						cursor = { x: pos.cursorX, y: pos.cursorY ?? 0 };
					}
					break;
				}
			}
		}

		this.screen.flush(cursor);
	}

	private fatal(message: string): void {
		this.cleanup();
		console.error(message);
		process.exit(1);
	}

	private flash(message: string): void {
		this.statusMessage = message;
		if (this.statusMessageTimer) clearTimeout(this.statusMessageTimer);
		this.statusMessageTimer = setTimeout(() => {
			this.statusMessage = null;
			this.markDirty();
		}, 3000);
		this.statusMessageTimer.unref();
		this.markDirty();
	}

	// ------------------------------------------------------------ RPC events

	private onRpcEvent(evt: RpcEvent): void {
		const res = eventToEntries(evt);
		for (const entry of res.entries) this.panel.addEntry(entry);
		if (res.agentStarted) {
			this.isStreaming = true;
			if (!this.requestStart) this.requestStart = Date.now();
			this.startSpinner();
			this.markDirty();
			return;
		}
		if (res.agentEnded) {
			this.isStreaming = false;
			this.requestStart = null;
			this.stopSpinner();
			this.panel.settleAllPending();
			this.panel.closeStream();
			void this.pollStats();
			void this.pollGit();
			this.markDirty();
			return;
		}
		if (res.streamReset) {
			this.panel.settleAllPending();
			this.panel.closeStream();
			this.markDirty();
			return;
		}
		if (res.thinkingDelta !== undefined) {
			this.panel.appendThinkingDelta(res.thinkingDelta);
			this.markDirty();
			return;
		}
		if (res.streamDelta !== undefined) {
			this.panel.appendStreamDelta(res.streamDelta);
			this.markDirty();
			return;
		}
		if (res.toolUpdate) {
			this.panel.updateToolEntry(res.toolUpdate.toolCallId, res.toolUpdate.text, res.toolUpdate.isError, res.toolUpdate.final);
			this.markDirty();
			return;
		}
		if (res.error) {
			this.isStreaming = false;
			this.requestStart = null;
			this.stopSpinner();
			this.panel.settleAllPending();
			this.panel.closeStream();
			this.flash(`Error: ${res.error}`);
			this.markDirty();
			return;
		}
		if (res.entries.length > 0) this.markDirty();
	}

	private onRpcResponse(resp: RpcResponse): void {
		if (resp.success) return;
		const errMsg = resp.error ?? "Command failed";
		this.panel.addEntry({ kind: "error", text: `${resp.command || "RPC"}: ${errMsg}`, tag: "[ERROR]", isError: true });
		this.flash(`Error: ${errMsg}`);
		this.isStreaming = false;
		this.requestStart = null;
		this.stopSpinner();
		this.markDirty();
	}

	private bindClient(client: PiClient): void {
		client.on("event", this.clientEventHandler);
		client.on("response", this.clientResponseHandler);
		client.on("disconnected", this.clientDisconnectedHandler);
	}

	private async getClientState(client: PiClient): Promise<RpcResponse & { data?: SessionStateData }> {
		let response = await client.request<SessionStateData>({ type: "get_state" });
		for (let attempt = 0; attempt < 3 && !response.success; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			response = await client.request<SessionStateData>({ type: "get_state" });
		}
		return response;
	}

	private unbindClient(client: PiClient): void {
		client.off("event", this.clientEventHandler);
		client.off("response", this.clientResponseHandler);
		client.off("disconnected", this.clientDisconnectedHandler);
	}

	private onDisconnected(): void {
		if (this.closed) return;
		this.isStreaming = false;
		this.isBash = false;
		this.stopSpinner();
		this.panel.settleAllPending();
		const entry: AgentEntry = { kind: "error", text: "PI DISCONNECTED - the agent process exited.", tag: "[ERROR]", isError: true };
		this.panel.addEntry(entry);
		this.flash("PI DISCONNECTED");
		this.markDirty();
	}

	private async pollStats(): Promise<void> {
		const resp = await this.client.request<SessionStatsData>({ type: "get_session_stats" });
		if (resp.success && resp.data?.contextUsage && typeof resp.data.contextUsage.tokens === "number") {
			this.contextTokens = resp.data.contextUsage.tokens;
			this.markDirty();
		}
	}

	private async pollGit(): Promise<void> {
		const polledCwd = this.cwd;
		const info = await collectGitInfo(polledCwd);
		if (polledCwd !== this.cwd) return;
		this.gitInfo = info;
		if (info.isRepo) this.tree.setGitStatus(info.dirtyFiles);
		this.markDirty();
	}

	// ----------------------------------------------------------------- input

	private onKey(key: KeyEvent): void {
		const action = mapKey(key);
		if (action.kind !== "ignored") this.handleAction(action);
		this.markDirty();
	}

	private onMouse(evt: MouseEvent): void {
		if (this.closed) return;
		this.handleMouse(evt);
		this.markDirty();
	}

	private handleMouse(evt: MouseEvent): void {
		const layout = this.layout;
		if (!layout) return;

		// 1. Wheel Scrolling
		if (evt.button === "wheelUp" || evt.button === "wheelDown") {
			const delta = evt.button === "wheelUp" ? -3 : 3;

			// Scrolling inside Overlays
			if (this.overlay) {
				if (this.overlay.kind === "text") {
					if (delta < 0) this.overlay.popup.up();
					else this.overlay.popup.down();
				} else if (this.overlay.kind === "diff") {
					this.overlay.viewer.scrollBy(delta);
				} else if (this.overlay.kind === "model") {
					if (delta < 0) this.overlay.selector.up();
					else this.overlay.selector.down();
				} else if (this.overlay.kind === "session") {
					if (delta < 0) this.overlay.selector.up();
					else this.overlay.selector.down();
				}
				return;
			}

			// Scrolling main windows
			if (isInRect(evt.x, evt.y, layout.projectPane)) {
				if (delta < 0) this.tree.handleKey("up");
				else this.tree.handleKey("down");
			} else if (isInRect(evt.x, evt.y, layout.inputLine)) {
				if (this.input.getLines().length > inner(layout.inputLine).h) {
					if (delta < 0) this.input.scrollBy(-1);
					else this.input.scrollBy(1);
				} else {
					if (delta < 0) this.panel.scrollUp(3);
					else this.panel.scrollDown(3);
				}
			} else if (isInRect(evt.x, evt.y, layout.agentPane)) {
				if (delta < 0) this.panel.scrollUp(3);
				else this.panel.scrollDown(3);
			}
			return;
		}

		// 2. Mouse Up (Release drag or finish text selection)
		if (evt.action === "up") {
			if (this.activeSelection) {
				let text: string | null = null;
				switch (this.activeSelection.kind) {
					case "agent":
						text = this.panel.finishSelection();
						break;
					case "input":
						text = this.input.finishSelection();
						break;
					case "text":
						if (this.overlay?.kind === "text") text = this.overlay.popup.finishSelection();
						break;
					case "diff":
						if (this.overlay?.kind === "diff") text = this.overlay.viewer.finishSelection();
						break;
				}
				if (text && text.length > 0) {
					copyToClipboard(text);
					this.flash(`Copied ${text.length} chars to clipboard`);
				}
				this.activeSelection = null;
				this.markDirty();
			}
			this.activeDrag = null;
			return;
		}

		// 3. Mouse Drag (Thumb dragging on scrollbar or text selection drag)
		if (evt.action === "drag") {
			if (this.activeDrag) {
				const ratio = Math.max(0, Math.min(1, (evt.y - this.activeDrag.trackY) / Math.max(1, this.activeDrag.trackH - 1)));
				switch (this.activeDrag.kind) {
					case "agent":
						this.panel.scrollToRatio(ratio);
						break;
					case "input":
						this.input.scrollToRatio(ratio);
						break;
					case "tree":
						this.tree.scrollToRatio(ratio);
						break;
					case "diff":
						if (this.overlay?.kind === "diff") this.overlay.viewer.scrollToRatio(ratio);
						break;
					case "text":
						if (this.overlay?.kind === "text") this.overlay.popup.scrollToRatio(ratio);
						break;
					case "model":
						if (this.overlay?.kind === "model") this.overlay.selector.scrollToRatio(ratio);
						break;
					case "session":
						if (this.overlay?.kind === "session") this.overlay.selector.scrollToRatio(ratio);
						break;
				}
				this.markDirty();
				return;
			}

			if (this.activeSelection) {
				switch (this.activeSelection.kind) {
					case "agent": {
						const targetRect = this.zoomedWindow === "agent" ? layout.desktop : layout.agentPane;
						const a = inner(targetRect);
						this.panel.updateSelection(evt.y - a.y, evt.x - a.x);
						break;
					}
					case "input": {
						this.input.updateSelection(evt.x, evt.y);
						break;
					}
					case "text": {
						if (this.overlay?.kind === "text") {
							const a = inner(this.overlay.popup.rect);
							this.overlay.popup.updateSelection(evt.y - a.y, evt.x - (a.x + 1));
						}
						break;
					}
					case "diff": {
						if (this.overlay?.kind === "diff") {
							const a = inner(this.overlay.viewer.rect);
							this.overlay.viewer.updateSelection(evt.y - a.y, evt.x - a.x);
						}
						break;
					}
				}
				this.markDirty();
				return;
			}
			return;
		}

		// Only handle left clicks on mouse down
		if (evt.button !== "left" || evt.action !== "down") return;

		// 4. Overlays & Popups handling
		if (this.overlay) {
			const ov = this.overlay;
			switch (ov.kind) {
				case "menu": {
					const menu = ov.state.menu;
					const ox = ov.x;
					const oy = ov.y;
					const ow = menuWidth(menu);
					const oh = menuHeight(menu);

					// Clicked inside dropdown
					if (evt.x >= ox && evt.x < ox + ow && evt.y >= oy + 1 && evt.y < oy + oh) {
						const itemIndex = evt.y - (oy + 1);
						const item = menu.items[itemIndex];
						if (item && !item.separator) {
							this.closeOverlay();
							if (item.action) this.dispatchCommand(item.action);
						}
						return;
					}

					// Clicked on the top menu bar row (y === 0)
					if (evt.y === 0) {
						const clickedIdx = this.menuBar.getMenuIndexAtX(evt.x);
						if (clickedIdx !== -1) {
							this.openMenuAt(clickedIdx);
							return;
						}
					}

					// Clicked outside menu
					this.closeOverlay();
					return;
				}

				case "about": {
					const r = ov.dialog.rect;
					const closeBox = evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4;
					const btnY = r.y + r.h - 3;
					const btnX = r.x + Math.floor((r.w - 12) / 2);
					const okBtn = evt.y === btnY && evt.x >= btnX && evt.x <= btnX + 12;
					if (closeBox || okBtn || !isInRect(evt.x, evt.y, r)) {
						this.closeOverlay();
					}
					return;
				}

				case "help": {
					const r = helpRect(this.screen.width, this.screen.height);
					const closeBox = evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4;
					const btnY = r.y + r.h - 3;
					const btnX = r.x + Math.floor((r.w - 12) / 2);
					const okBtn = evt.y === btnY && evt.x >= btnX && evt.x <= btnX + 12;
					if (closeBox || okBtn || !isInRect(evt.x, evt.y, r)) {
						this.closeOverlay();
					}
					return;
				}

				case "prompt": {
					const r = ov.dialog.rect;
					const closeBox = evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4;
					const btnY = r.y + 4;
					const okX = r.x + Math.floor((r.w - 24) / 2);
					const cancelX = okX + 13;

					if (closeBox || (evt.y === btnY && evt.x >= cancelX && evt.x <= cancelX + 10)) {
						this.closeOverlay();
						return;
					}
					if (evt.y === btnY && evt.x >= okX && evt.x <= okX + 10) {
						const val = ov.dialog.submit();
						this.closeOverlay();
						ov.onSubmit(val);
						return;
					}
					// Clicking input box sets cursor position
					if (evt.y === r.y + 2 && evt.x >= r.x + 3 && evt.x < r.x + r.w - 3) {
						ov.dialog.cursorPos = Math.max(0, Math.min(ov.dialog.value.length, evt.x - (r.x + 3)));
						return;
					}
					if (!isInRect(evt.x, evt.y, r)) {
						this.closeOverlay();
					}
					return;
				}

				case "providerConfig": {
					const r = ov.dialog.rect;
					const closeBox = evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4;
					if (closeBox || !isInRect(evt.x, evt.y, r)) {
						this.closeOverlay();
						return;
					}
					const a = inner(r);
					const listY = a.y + 1;
					const maxRows = Math.max(4, a.h - 5);
					if (evt.y >= listY && evt.y < listY + Math.min(ov.dialog.providers.length, maxRows)) {
						ov.dialog.index = evt.y - listY;
						this.openEditApiKey(ov.dialog.current());
						return;
					}
					const btnY = r.y + r.h - 2;
					if (evt.y === btnY) {
						if (evt.x >= r.x + Math.floor(r.w / 2)) {
							this.closeOverlay();
						} else {
							this.openEditApiKey(ov.dialog.current());
						}
						return;
					}
					return;
				}

				case "addModel": {
					const r = ov.dialog.rect;
					const closeBox = evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4;
					if (closeBox || !isInRect(evt.x, evt.y, r)) {
						this.closeOverlay();
						return;
					}
					const a = inner(r);
					if (evt.y === a.y + 1) {
						ov.dialog.fieldIndex = 0;
						ov.dialog.cycleProvider(1);
						this.markDirty();
						return;
					}
					if (evt.y === a.y + 3) {
						ov.dialog.fieldIndex = 1;
						ov.dialog.cursorPos = Math.max(0, Math.min(ov.dialog.modelId.length, evt.x - (a.x + 16)));
						this.markDirty();
						return;
					}
					if (evt.y === a.y + 5) {
						ov.dialog.fieldIndex = 2;
						ov.dialog.cursorPos = Math.max(0, Math.min(ov.dialog.displayName.length, evt.x - (a.x + 16)));
						this.markDirty();
						return;
					}
					if (evt.y === a.y + 7) {
						ov.dialog.fieldIndex = 3;
						ov.dialog.toggleReasoning();
						this.markDirty();
						return;
					}
					const btnY = r.y + r.h - 2;
					if (evt.y === btnY) {
						if (evt.x >= r.x + Math.floor(r.w / 2)) {
							this.closeOverlay();
						} else {
							this.saveAndApplyCustomModel(ov.dialog.submit());
						}
						return;
					}
					return;
				}

				case "model": {
					const r = ov.selector.rect;
					const closeBox = evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4;
					if (closeBox) {
						this.closeOverlay();
						return;
					}
					const btnY = r.y + r.h - 3;
					const selectX = r.x + Math.floor((r.w - 26) / 2);
					const cancelX = selectX + 13;

					if (evt.y === btnY && evt.x >= cancelX && evt.x <= cancelX + 10) {
						this.closeOverlay();
						return;
					}
					if (evt.y === btnY && evt.x >= selectX && evt.x <= selectX + 10) {
						const m = ov.selector.current();
						this.closeOverlay();
						if (m) void this.selectModel(m);
						return;
					}

					// Scrollbar in model selector
					const a = inner(r);
					const listH = a.h - 3;
					const scrollX = a.x + a.w - 1;
					if (evt.x === scrollX && evt.y >= a.y && evt.y < a.y + listH) {
						if (evt.y === a.y) {
							ov.selector.up();
							return;
						}
						if (evt.y === a.y + listH - 1) {
							ov.selector.down();
							return;
						}
						const trackH = listH - 2;
						const clickRow = evt.y - (a.y + 1);
						const thumbRow = ov.selector.getThumbRow(trackH);
						this.activeDrag = { kind: "model", trackY: a.y + 1, trackH };
						if (clickRow < thumbRow) {
							ov.selector.pageUp();
						} else if (clickRow > thumbRow) {
							ov.selector.pageDown();
						}
						return;
					}

					// Clicking a row in the models list
					if (evt.y >= r.y + 1 && evt.y < btnY) {
						const clickedRow = evt.y - (r.y + 1);
						const offset = Math.max(0, Math.min(ov.selector.index - Math.floor(listH / 2), ov.selector.models.length - listH));
						const targetIdx = offset + clickedRow;
						if (targetIdx >= 0 && targetIdx < ov.selector.models.length) {
							if (ov.selector.index === targetIdx) {
								const m = ov.selector.current();
								this.closeOverlay();
								if (m) void this.selectModel(m);
								return;
							}
							ov.selector.index = targetIdx;
						}
					}
					return;
				}

				case "session": {
					const r = ov.selector.rect;
					const closeBox = evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4;
					if (closeBox || !isInRect(evt.x, evt.y, r)) {
						this.closeOverlay();
						return;
					}
					const a = inner(r);
					const listY = a.y + 2;
					const visibleRows = Math.max(1, a.h - 3);

					// Scrollbar in session selector
					const scrollX = a.x + a.w - 1;
					if (evt.x === scrollX && evt.y >= listY - 1 && evt.y <= listY + visibleRows) {
						if (evt.y === listY - 1) {
							ov.selector.up();
							this.markDirty();
							return;
						}
						if (evt.y === listY + visibleRows) {
							ov.selector.down();
							this.markDirty();
							return;
						}
						const trackH = visibleRows;
						const clickRow = evt.y - listY;
						const thumbRow = ov.selector.getThumbRow(trackH);
						this.activeDrag = { kind: "session", trackY: listY, trackH };
						if (clickRow < thumbRow) {
							ov.selector.pageUp();
						} else if (clickRow > thumbRow) {
							ov.selector.pageDown();
						}
						this.markDirty();
						return;
					}

					// Clicking a row in the session list
					if (evt.y >= listY && evt.y < listY + visibleRows) {
						const clickedRow = evt.y - listY;
						let startIdx = 0;
						if (ov.selector.index >= visibleRows) {
							startIdx = ov.selector.index - visibleRows + 1;
						}
						const targetIdx = startIdx + clickedRow;
						if (targetIdx >= 0 && targetIdx < ov.selector.sessions.length) {
							if (ov.selector.index === targetIdx) {
								const s = ov.selector.current();
								this.closeOverlay();
								if (s) void this.loadRecentSession(s.path);
								return;
							}
							ov.selector.index = targetIdx;
							this.markDirty();
						}
						return;
					}
					return;
				}

				case "text":
				case "diff": {
					const r = ov.kind === "text" ? ov.popup.rect : ov.viewer.rect;
					const closeBox = evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4;
					if (closeBox) {
						this.closeOverlay();
						return;
					}

					const zoomBox = evt.y === r.y && evt.x >= r.x + r.w - 5 && evt.x <= r.x + r.w - 3;
					if (zoomBox) {
						if (ov.kind === "text") ov.popup.toggleZoom(layout.cols, layout.rows);
						else ov.viewer.toggleZoom(layout.cols, layout.rows);
						return;
					}

					// Scrollbar on popup
					const scrollX = r.x + r.w - 1;
					const scrollY = r.y + 1;
					const scrollH = r.h - 2;
					if (evt.x === scrollX && evt.y >= scrollY && evt.y < scrollY + scrollH) {
						if (evt.y === scrollY) {
							if (ov.kind === "text") ov.popup.up();
							else ov.viewer.scrollBy(-1);
							return;
						}
						if (evt.y === scrollY + scrollH - 1) {
							if (ov.kind === "text") ov.popup.down();
							else ov.viewer.scrollBy(1);
							return;
						}
						const trackH = scrollH - 2;
						const clickRow = evt.y - (scrollY + 1);
						const thumbRow = ov.kind === "text" ? ov.popup.getThumbRow(trackH) : ov.viewer.getThumbRow(trackH);
						this.activeDrag = { kind: ov.kind, trackY: scrollY + 1, trackH };
						if (clickRow < thumbRow) {
							if (ov.kind === "text") ov.popup.pageUp();
							else ov.viewer.scrollBy(-Math.max(1, inner(r).h - 2));
						} else if (clickRow > thumbRow) {
							if (ov.kind === "text") ov.popup.pageDown();
							else ov.viewer.scrollBy(Math.max(1, inner(r).h - 2));
						}
						return;
					}

					// Text selection inside popup
					const a = inner(r);
					if (isInRect(evt.x, evt.y, a) && evt.x < r.x + r.w - 1) {
						if (ov.kind === "text") {
							ov.popup.startSelection(evt.y - a.y, evt.x - (a.x + 1));
							this.activeSelection = { kind: "text" };
						} else {
							ov.viewer.startSelection(evt.y - a.y, evt.x - a.x);
							this.activeSelection = { kind: "diff" };
						}
						this.markDirty();
						return;
					}

					if (!isInRect(evt.x, evt.y, r)) {
						this.closeOverlay();
					}
					return;
				}
			}
		}

		// 5. Top Menu Bar (Row 0)
		if (evt.y === 0) {
			const clickedIdx = this.menuBar.getMenuIndexAtX(evt.x);
			if (clickedIdx !== -1) {
				this.openMenuAt(clickedIdx);
			}
			return;
		}

		// 6. Bottom Key Bar (Row layout.keyBar.y)
		if (evt.y === layout.keyBar.y) {
			const hasHint = this.menuBar.openIndex !== null;
			const hasMessage = this.statusMessage !== null;
			const isThinking = this.isStreaming || this.isBash;
			const slot = getKeyBarSlotAtX(evt.x, layout.cols, hasHint, hasMessage, isThinking);
			if (slot !== null) {
				switch (slot) {
					case 0: this.handleAction({ kind: "help" }); break;
					case 1: this.handleAction({ kind: "saveSession" }); break;
					case 2: this.handleAction({ kind: "openSession" }); break;
					case 3: this.handleAction({ kind: "model" }); break;
					case 4: this.handleAction({ kind: "effort" }); break;
					case 5: this.handleAction({ kind: "mode" }); break;
					case 6: this.handleAction({ kind: "diff" }); break;
					case 7: this.handleAction({ kind: "tests" }); break;
					case 8: this.handleAction({ kind: "build" }); break;
					case 9: this.openMenuAt(0); break;
				}
			}
			return;
		}

		// 7. Zoomed Window (Full desktop mode)
		if (this.zoomedWindow) {
			const r = layout.desktop;
			if (isInRect(evt.x, evt.y, r)) {
				// Close box [■]
				if (evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4) {
					if (this.zoomedWindow === "agent") {
						this.panel.clear();
						this.flash("Agent view cleared");
					} else {
						this.tree.reload();
						this.flash("Files reloaded");
					}
					return;
				}
				// Zoom box [▲] (Restore)
				if (evt.y === r.y && evt.x >= r.x + r.w - 5 && evt.x <= r.x + r.w - 3) {
					this.zoomedWindow = null;
					this.flash("Windows restored");
					return;
				}

				// Scrollbar on right edge of desktop
				const scrollX = r.x + r.w - 1;
				const scrollY = r.y + 1;
				const scrollH = r.h - 2;
				if (evt.x === scrollX && evt.y >= scrollY && evt.y < scrollY + scrollH) {
					if (evt.y === scrollY) {
						if (this.zoomedWindow === "agent") this.panel.scrollUp(1);
						else this.tree.handleKey("up");
						return;
					}
					if (evt.y === scrollY + scrollH - 1) {
						if (this.zoomedWindow === "agent") this.panel.scrollDown(1);
						else this.tree.handleKey("down");
						return;
					}
					const trackH = scrollH - 2;
					const clickRow = evt.y - (scrollY + 1);
					const thumbRow = this.zoomedWindow === "agent" ? this.panel.getThumbRow(trackH) : this.tree.getThumbRow(trackH, inner(r).h);
					this.activeDrag = { kind: this.zoomedWindow, trackY: scrollY + 1, trackH };
					if (clickRow < thumbRow) {
						if (this.zoomedWindow === "agent") this.panel.pageUp(Math.max(1, inner(r).h - 2));
						else this.tree.handleKey("pageup");
					} else if (clickRow > thumbRow) {
						if (this.zoomedWindow === "agent") this.panel.pageDown(Math.max(1, inner(r).h - 2));
						else this.tree.handleKey("pagedown");
					}
					return;
				}

				// Text selection in zoomed agent window
				if (this.zoomedWindow === "agent") {
					const a = inner(r);
					if (isInRect(evt.x, evt.y, a) && evt.x < r.x + r.w - 1) {
						this.panel.startSelection(evt.y - a.y, evt.x - a.x);
						this.activeSelection = { kind: "agent" };
						this.focus = "agent";
						this.markDirty();
						return;
					}
				}

				// Clicking a row in tree
				if (this.zoomedWindow === "tree" && evt.y >= r.y + 1 && evt.y < r.y + r.h - 1) {
					const visualRow = evt.y - (r.y + 1);
					const res = this.tree.handleClick(visualRow);
					if (res === "open-file") {
						this.previewSelectedFile();
					}
				}
				return;
			}
		}

		// 8. Project Tree Window (FILES.PAS in tiled mode)
		if (isInRect(evt.x, evt.y, layout.projectPane)) {
			this.focus = "tree";
			const r = layout.projectPane;
			// Top-left close box: reload tree
			if (evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4) {
				this.tree.reload();
				this.flash("Files reloaded");
				return;
			}
			// Top-right zoom box [▲]
			if (evt.y === r.y && evt.x >= r.x + r.w - 5 && evt.x <= r.x + r.w - 3) {
				this.zoomedWindow = "tree";
				this.flash("FILES.PAS maximized (click [▲] to restore)");
				return;
			}

			// Scrollbar on right edge of tree
			const scrollX = r.x + r.w - 1;
			const scrollY = r.y + 1;
			const scrollH = r.h - 2;
			if (evt.x === scrollX && evt.y >= scrollY && evt.y < scrollY + scrollH) {
				if (evt.y === scrollY) {
					this.tree.handleKey("up");
					return;
				}
				if (evt.y === scrollY + scrollH - 1) {
					this.tree.handleKey("down");
					return;
				}
				const trackH = scrollH - 2;
				const clickRow = evt.y - (scrollY + 1);
				const thumbRow = this.tree.getThumbRow(trackH, inner(r).h);
				this.activeDrag = { kind: "tree", trackY: scrollY + 1, trackH };
				if (clickRow < thumbRow) {
					this.tree.handleKey("pageup");
				} else if (clickRow > thumbRow) {
					this.tree.handleKey("pagedown");
				}
				return;
			}

			// Clicking a row
			if (evt.y >= r.y + 1 && evt.y < r.y + r.h - 1) {
				const visualRow = evt.y - (r.y + 1);
				const res = this.tree.handleClick(visualRow);
				if (res === "open-file") {
					this.previewSelectedFile();
				}
			}
			return;
		}

		// 9. Agent Panel Window (AGENT.PAS in tiled mode)
		if (isInRect(evt.x, evt.y, layout.agentPane)) {
			this.focus = "agent";
			const r = layout.agentPane;
			// Top-left close box: clear agent log
			if (evt.y === r.y && evt.x >= r.x + 2 && evt.x <= r.x + 4) {
				this.panel.clear();
				this.flash("Agent view cleared");
				return;
			}
			// Top-right zoom box [▲]
			if (evt.y === r.y && evt.x >= r.x + r.w - 5 && evt.x <= r.x + r.w - 3) {
				this.zoomedWindow = "agent";
				this.flash(`${this.getEffectiveSessionName()} maximized (click [▲] to restore)`);
				return;
			}

			// Scrollbar on right edge of agent pane
			const scrollX = r.x + r.w - 1;
			const scrollY = r.y + 1;
			const scrollH = r.h - 2;
			if (evt.x === scrollX && evt.y >= scrollY && evt.y < scrollY + scrollH) {
				if (evt.y === scrollY) {
					this.panel.scrollUp(1);
					return;
				}
				if (evt.y === scrollY + scrollH - 1) {
					this.panel.scrollDown(1);
					return;
				}
				const trackH = scrollH - 2;
				const clickRow = evt.y - (scrollY + 1);
				const thumbRow = this.panel.getThumbRow(trackH);
				this.activeDrag = { kind: "agent", trackY: scrollY + 1, trackH };
				if (clickRow < thumbRow) {
					this.panel.pageUp(Math.max(1, inner(r).h - 2));
				} else if (clickRow > thumbRow) {
					this.panel.pageDown(Math.max(1, inner(r).h - 2));
				}
				return;
			}

			// Text selection in agent pane
			const a = inner(r);
			if (isInRect(evt.x, evt.y, a) && evt.x < r.x + r.w - 1) {
				this.panel.startSelection(evt.y - a.y, evt.x - a.x);
				this.activeSelection = { kind: "agent" };
				this.markDirty();
				return;
			}
			return;
		}

		// 10. Message Input Window (MODEL / INPUT in tiled mode)
		if (isInRect(evt.x, evt.y, layout.inputLine)) {
			this.focus = "input";
			const r = layout.inputLine;
			// Top-right zoom box [▲] on input window zooms agent window
			if (evt.y === r.y && evt.x >= r.x + r.w - 5 && evt.x <= r.x + r.w - 3) {
				this.zoomedWindow = "agent";
				this.flash(`${this.getEffectiveSessionName()} maximized (click [▲] to restore)`);
				return;
			}

			// Scrollbar on right edge of input window (when multi-line)
			const scrollX = r.x + r.w - 1;
			const scrollY = r.y + 1;
			const scrollH = r.h - 2;
			if (r.h > 4 && this.input.getLines().length > inner(r).h && evt.x === scrollX && evt.y >= scrollY && evt.y < scrollY + scrollH) {
				if (evt.y === scrollY) {
					this.input.scrollBy(-1);
					return;
				}
				if (evt.y === scrollY + scrollH - 1) {
					this.input.scrollBy(1);
					return;
				}
				const trackH = scrollH - 2;
				const clickRow = evt.y - (scrollY + 1);
				const thumbRow = this.input.getThumbRow(trackH);
				this.activeDrag = { kind: "input", trackY: scrollY + 1, trackH };
				if (clickRow < thumbRow) {
					this.input.scrollBy(-Math.max(1, inner(r).h - 1));
				} else if (clickRow > thumbRow) {
					this.input.scrollBy(Math.max(1, inner(r).h - 1));
				}
				return;
			}

			const a = inner(r);
			if (isInRect(evt.x, evt.y, a) && evt.x < r.x + r.w - 1) {
				this.input.startSelection(evt.x, evt.y);
				this.activeSelection = { kind: "input" };
				this.markDirty();
				return;
			}
			return;
		}
	}

	private cycleFocus(): void {
		if (this.focus === "input") this.focus = "agent";
		else if (this.focus === "agent") this.focus = "tree";
		else this.focus = "input";
		this.flash(`Active window: ${this.focus.toUpperCase()}`);
	}

	private handleAction(action: AppAction): void {
		if (action.kind === "exit") {
			this.exit();
			return;
		}
		if (action.kind === "cancel") {
			const panelText = this.panel.getSelectedText();
			const inputText = this.input.getSelectedText();
			const popupText = this.overlay?.kind === "text" ? this.overlay.popup.getSelectedText() : null;
			const diffText = this.overlay?.kind === "diff" ? this.overlay.viewer.getSelectedText() : null;
			const selected = panelText ?? inputText ?? popupText ?? diffText;
			if (selected) {
				copyToClipboard(selected);
				this.panel.clearSelection();
				this.input.clearSelection();
				if (this.overlay?.kind === "text") this.overlay.popup.clearSelection();
				if (this.overlay?.kind === "diff") this.overlay.viewer.clearSelection();
				this.flash(`Copied ${selected.length} chars to clipboard`);
				this.markDirty();
				return;
			}
			if (this.overlay) {
				this.closeOverlay();
				return;
			}
			if (this.isStreaming || this.isBash) this.abortRunningCommand();
			else this.flash("Nothing to cancel. Alt+X exits.");
			return;
		}

		if (action.kind === "openMenu") {
			const idx = MAIN_MENUS.findIndex((m) => m.title.toLowerCase() === action.menu.toLowerCase());
			if (idx !== -1) {
				this.openMenuAt(idx);
				return;
			}
		}

		if (this.overlay) {
			this.handleOverlayAction(action);
			return;
		}

		// Tab cycles window focus (Input -> Agent -> Files)
		if (action.kind === "tab") {
			this.cycleFocus();
			return;
		}

		// Global F-keys work regardless of focus.
		switch (action.kind) {
			case "menu":
				this.openMenuAt(0);
				return;
			case "help":
				this.overlay = { kind: "help" };
				return;
			case "saveSession":
				this.saveSessionToFile();
				return;
			case "openSession":
				this.openSavedSession();
				return;
			case "model":
				void this.openModelSelector();
				return;
			case "effort":
				void this.cycleThinkingLevel();
				return;
			case "mode":
				this.togglePlanBuildMode();
				return;
			case "diff":
				void this.showDiff();
				return;
			case "tests":
				void this.runViaRpc("npm test");
				return;
			case "build":
				void this.runViaRpc("npm run build");
				return;
			case "files":
				this.focus = "tree";
				return;
			case "agent":
				this.focus = this.focus === "input" ? "agent" : "input";
				return;
			case "run":
				this.openPrompt("Run command:", "", (cmd) => {
					if (cmd) void this.runViaRpc(cmd);
				});
				return;
			case "git":
				void this.showGitStatus();
				return;
			case "save":
				this.saveSessionToFile();
				return;
			case "find":
				this.openPrompt("Find file:", "", (v) => {
					this.tree.setFilter(v);
					this.focus = "tree";
					this.flash(v ? `Filter: ${v}` : "Filter cleared");
				});
				return;
			case "clearView":
				this.panel.clear();
				this.flash("Agent view cleared");
				return;
			case "toggleThinking":
				this.panel.toggleThinkingCollapse();
				this.markDirty();
				this.flash(this.panel.isThinkingCollapsed() ? "Thinking collapsed" : "Thinking expanded");
				return;
			case "toggleToolOutput":
				this.panel.toggleToolOutputExpanded();
				this.markDirty();
				this.flash(this.panel.isToolOutputExpanded() ? "Tool output expanded" : "Tool output preview");
				return;
		}

		if (this.focus === "tree") {
			switch (action.kind) {
				case "up":
				case "down":
				case "pageup":
				case "pagedown":
				case "home":
				case "end": {
					this.tree.handleKey(action.kind);
					return;
				}
				case "enter": {
					const result = this.tree.handleKey(action.kind);
					if (result === "open-file") this.previewSelectedFile();
					return;
				}
				case "char":
					// Typing while on tree switches focus to input and inserts char
					this.focus = "input";
					this.input.insert(action.ch);
					return;
				case "esc":
					this.focus = "input";
					return;
				default:
					break;
			}
		}

		if (this.focus === "agent") {
			switch (action.kind) {
				case "up":
					this.panel.scrollUp(1);
					return;
				case "down":
					this.panel.scrollDown(1);
					return;
				case "pageup":
					this.panel.pageUp(10);
					return;
				case "pagedown":
					this.panel.pageDown(10);
					return;
				case "home":
					this.panel.scrollToTop();
					return;
				case "end":
					this.panel.scrollToBottom();
					return;
				case "enter":
					this.focus = "input";
					return;
				case "char":
					// Typing switches to input window
					this.focus = "input";
					this.input.insert(action.ch);
					return;
				case "esc":
					this.focus = "input";
					return;
				default:
					break;
			}
		}

		// Agent input focus
		switch (action.kind) {
			case "char":
				this.input.insert(action.ch);
				return;
			case "newline":
				this.input.insertNewline();
				return;
			case "backspace":
				this.input.backspace();
				return;
			case "delete":
				this.input.delete();
				return;
			case "left":
				this.input.left();
				return;
			case "right":
				this.input.right();
				return;
			case "home":
				this.input.home();
				return;
			case "end":
				this.input.end();
				return;
			case "pageup":
				if (this.input.getLines().length > 1) this.input.scrollBy(-5);
				else this.panel.pageUp(10);
				return;
			case "pagedown":
				if (this.input.getLines().length > 1) this.input.scrollBy(5);
				else this.panel.pageDown(10);
				return;
			case "enter": {
				const text = this.input.submit();
				if (text) void this.processInputSubmission(text);
				return;
			}
			case "up":
				if (!this.input.up()) {
					this.input.historyPrev();
				}
				return;
			case "down":
				if (!this.input.down()) {
					this.input.historyNext();
				}
				return;
			case "esc":
				if (this.isStreaming) this.abortAgent();
				else this.focus = "tree";
				return;
		}
	}

	private handleOverlayAction(action: AppAction): void {
		const ov = this.overlay;
		if (!ov) return;

		if (ov.kind === "menu") {
			switch (action.kind) {
				case "esc":
					this.closeOverlay();
					return;
				case "left":
					this.menuBar.handleAction("left");
					this.replaceWithCurrentMenu();
					return;
				case "right":
					this.menuBar.handleAction("right");
					this.replaceWithCurrentMenu();
					return;
				case "up":
					ov.state.move(-1);
					return;
				case "down":
					ov.state.move(1);
					return;
				case "char": {
					const idx = ov.state.findByMnemonic(action.ch);
					if (idx !== null) {
						ov.state.index = idx;
						const item = ov.state.current();
						this.closeOverlay();
						this.menuBar.openIndex = null;
						if (item?.action) this.dispatchCommand(item.action);
					}
					return;
				}
				case "enter": {
					const item = ov.state.current();
					this.closeOverlay();
					this.menuBar.openIndex = null;
					if (item?.action) this.dispatchCommand(item.action);
					return;
				}
			}
			return;
		}

		if (ov.kind === "providerConfig") {
			switch (action.kind) {
				case "esc":
					this.closeOverlay();
					return;
				case "up":
					ov.dialog.up();
					return;
				case "down":
					ov.dialog.down();
					return;
				case "home":
					ov.dialog.home();
					return;
				case "end":
					ov.dialog.end();
					return;
				case "char": {
					const idx = ov.dialog.findByDigit(action.ch);
					if (idx !== null) {
						this.openEditApiKey(ov.dialog.current());
					}
					return;
				}
				case "enter": {
					this.openEditApiKey(ov.dialog.current());
					return;
				}
			}
			return;
		}

		if (ov.kind === "addModel") {
			switch (action.kind) {
				case "esc":
					this.closeOverlay();
					return;
				case "tab":
					ov.dialog.nextField();
					this.markDirty();
					return;
				case "up":
					ov.dialog.prevField();
					this.markDirty();
					return;
				case "down":
					ov.dialog.nextField();
					this.markDirty();
					return;
				case "left":
					ov.dialog.left();
					this.markDirty();
					return;
				case "right":
					ov.dialog.right();
					this.markDirty();
					return;
				case "home":
					ov.dialog.home();
					this.markDirty();
					return;
				case "end":
					ov.dialog.end();
					this.markDirty();
					return;
				case "backspace":
					ov.dialog.backspace();
					this.markDirty();
					return;
				case "delete":
					ov.dialog.delete();
					this.markDirty();
					return;
				case "char": {
					if (action.ch === " " && ov.dialog.fieldIndex === 3) {
						ov.dialog.toggleReasoning();
					} else {
						ov.dialog.insert(action.ch);
					}
					this.markDirty();
					return;
				}
				case "enter": {
					if (ov.dialog.fieldIndex === 5) {
						this.closeOverlay();
						return;
					}
					if (ov.dialog.fieldIndex === 3) {
						ov.dialog.toggleReasoning();
						this.markDirty();
						return;
					}
					if (ov.dialog.fieldIndex === 4 || ov.dialog.modelId.trim()) {
						this.saveAndApplyCustomModel(ov.dialog.submit());
						return;
					}
					ov.dialog.nextField();
					this.markDirty();
					return;
				}
			}
			return;
		}

		if (ov.kind === "model") {
			switch (action.kind) {
				case "esc":
					this.closeOverlay();
					return;
				case "up":
					ov.selector.up();
					return;
				case "down":
					ov.selector.down();
					return;
				case "pageup":
					ov.selector.pageUp();
					return;
				case "pagedown":
					ov.selector.pageDown();
					return;
				case "home":
					ov.selector.home();
					return;
				case "end":
					ov.selector.end();
					return;
				case "enter": {
					const m = ov.selector.current();
					this.closeOverlay();
					if (m) void this.selectModel(m);
					return;
				}
			}
			return;
		}

		if (ov.kind === "session") {
			switch (action.kind) {
				case "esc":
					this.closeOverlay();
					return;
				case "up":
					ov.selector.up();
					this.markDirty();
					return;
				case "down":
					ov.selector.down();
					this.markDirty();
					return;
				case "pageup":
					ov.selector.pageUp();
					this.markDirty();
					return;
				case "pagedown":
					ov.selector.pageDown();
					this.markDirty();
					return;
				case "home":
					ov.selector.home();
					this.markDirty();
					return;
				case "end":
					ov.selector.end();
					this.markDirty();
					return;
				case "char": {
					const idx = ov.selector.findByDigit(action.ch);
					if (idx !== null) {
						const s = ov.selector.current();
						this.closeOverlay();
						if (s) void this.loadRecentSession(s.path);
					}
					return;
				}
				case "enter": {
					const s = ov.selector.current();
					this.closeOverlay();
					if (s) void this.loadRecentSession(s.path);
					return;
				}
			}
			return;
		}

		if (ov.kind === "diff") {
			switch (action.kind) {
				case "esc":
					this.closeOverlay();
					return;
				case "up":
					ov.viewer.scrollBy(-1);
					return;
				case "down":
					ov.viewer.scrollBy(1);
					return;
				case "pageup":
					ov.viewer.scrollBy(-10);
					return;
				case "pagedown":
					ov.viewer.scrollBy(10);
					return;
			}
			return;
		}

		if (ov.kind === "text") {
			switch (action.kind) {
				case "esc":
					this.closeOverlay();
					return;
				case "up":
					ov.popup.up();
					return;
				case "down":
					ov.popup.down();
					return;
				case "pageup":
					ov.popup.pageUp();
					return;
				case "pagedown":
					ov.popup.pageDown();
					return;
				case "home":
					ov.popup.home();
					return;
				case "end":
					ov.popup.end();
					return;
			}
			return;
		}

		if (ov.kind === "prompt") {
			switch (action.kind) {
				case "esc":
					this.closeOverlay();
					return;
				case "char":
					ov.dialog.insert(action.ch);
					return;
				case "backspace":
					ov.dialog.backspace();
					return;
				case "delete":
					ov.dialog.delete();
					return;
				case "left":
					ov.dialog.left();
					return;
				case "right":
					ov.dialog.right();
					return;
				case "home":
					ov.dialog.home();
					return;
				case "end":
					ov.dialog.end();
					return;
				case "enter": {
					const value = ov.dialog.submit();
					this.closeOverlay();
					ov.onSubmit(value);
					return;
				}
			}
			return;
		}

		if ((ov.kind === "help" || ov.kind === "about") && (action.kind === "esc" || action.kind === "enter" || action.kind === "char")) {
			this.closeOverlay();
		}
	}

	private closeOverlay(): void {
		this.overlay = null;
		this.menuBar.openIndex = null;
	}

	private openPrompt(title: string, prefill: string, onSubmit: (value: string) => void, options?: { secret?: boolean }): void {
		const { cols, rows } = this.term.size();
		this.overlay = { kind: "prompt", dialog: new PromptDialog(cols, rows, title, prefill, options?.secret ?? false), onSubmit };
	}

	private openMenuAt(index: number): void {
		this.menuBar.openIndex = index;
		const state = this.menuBar.currentMenu();
		if (!state) return;
		const menuX = this.menuBar.getMenuX(index);
		this.overlay = { kind: "menu", state, x: menuX, y: 1 };
	}

	private replaceWithCurrentMenu(): void {
		const index = this.menuBar.openIndex ?? 0;
		this.openMenuAt(index);
	}

	private dispatchCommand(command: string): void {
		if (command.startsWith("file.recent:")) {
			const index = Number.parseInt(command.slice("file.recent:".length), 10);
			const session = this.recentSessions[index];
			if (session) void this.loadRecentSession(session.path);
			return;
		}

		switch (command) {
			case "app.exit":
				this.exit();
				break;
			case "file.save":
				this.saveSessionToFile();
				break;
			case "file.open":
				this.openSavedSession();
				break;
			case "file.new":
				void this.newSession();
				break;
			case "file.preview":
				this.previewSelectedFile();
				break;
			case "file.chdir":
				this.changeDirectory();
				break;
			case "file.export":
				void this.exportSession();
				break;
			case "edit.clearInput":
				this.clearInputLine();
				break;
			case "view.clear":
				this.panel.clear();
				this.flash("Agent view cleared");
				break;
			case "edit.lastAnswer":
				void this.showLastAssistantText();
				break;
			case "search.find":
				this.handleAction({ kind: "find" });
				break;
			case "search.clear":
				this.clearSearchFilter();
				break;
			case "search.grep":
				this.grepSearch();
				break;
			case "run.command":
				this.handleAction({ kind: "run" });
				break;
			case "run.tests":
				void this.runViaRpc("npm test");
				break;
			case "run.build":
				void this.runViaRpc("npm run build");
				break;
			case "run.abort":
				this.abortRunningCommand();
				break;
			case "tools.model":
				void this.openModelSelector();
				break;
			case "agent.cycle":
				void this.cycleModel();
				break;
			case "agent.thinking":
				void this.cycleThinkingLevel();
				break;
			case "agent.mode":
				this.togglePlanBuildMode();
				break;
			case "agent.compact":
				void this.compactSession();
				break;
			case "agent.fork":
				void this.forkSessionPrompt();
				break;
			case "agent.clone":
				void this.cloneSessionBranch();
				break;
			case "agent.abort":
				this.abortAgent();
				break;
			case "git.status":
				void this.showGitStatus();
				break;
			case "git.diff":
				void this.showDiff();
				break;
			case "git.log":
				void this.showGitLog();
				break;
			case "git.refresh":
				void this.pollGit();
				this.flash("Git status refreshed");
				break;
			case "tools.stats":
				void this.showStats();
				break;
			case "tools.rename":
				this.renameSession();
				break;
			case "tree.refresh":
				this.tree.reload();
				void this.pollGit();
				this.flash("Project tree refreshed");
				break;
			case "tools.env":
				this.showEnvInfo();
				break;
			case "opt.keys":
				this.openProviderDialog();
				break;
			case "opt.addModel":
				this.openAddModelDialog();
				break;
			case "opt.reloadModels":
				void this.reloadAvailableModels();
				break;
			case "opt.compaction":
				void this.toggleAutoCompaction();
				break;
			case "opt.retry":
				void this.toggleAutoRetry();
				break;
			case "opt.steering":
				void this.toggleSteeringMode();
				break;
			case "opt.followUp":
				void this.toggleFollowUpMode();
				break;
			case "window.next":
				this.cycleFocus();
				break;
			case "window.zoom":
				this.toggleZoom();
				break;
			case "window.files":
				this.focus = "tree";
				this.flash("Active window: FILES");
				break;
			case "window.agent":
				this.focus = "agent";
				this.flash(`Active window: ${this.getEffectiveSessionName()}`);
				break;
			case "window.input":
				this.focus = "input";
				this.flash("Active window: INPUT");
				break;
			case "window.tile":
				this.tileWindows();
				break;
			case "help.show":
				this.overlay = { kind: "help" };
				break;
			case "help.guide":
				this.showGuide();
				break;
			case "help.about": {
				const { cols, rows } = this.term.size();
				this.overlay = { kind: "about", dialog: new AboutDialog(cols, rows) };
				break;
			}
		}
	}

	// -------------------------------------------------------------- commands

	private async processInputSubmission(text: string): Promise<void> {
		const trimmed = text.trim();
		if (trimmed.startsWith("/")) {
			const handled = await this.handleSlashCommand(trimmed);
			if (handled) return;
		}
		this.sendPrompt(text);
	}

	private async handleSlashCommand(text: string): Promise<boolean> {
		const trimmed = text.trim();
		if (!trimmed.startsWith("/")) return false;

		const [cmdWithSlash, ...argParts] = trimmed.split(/\s+/);
		const cmd = (cmdWithSlash || "").toLowerCase();
		const arg = argParts.join(" ").trim();

		switch (cmd) {
			case "/status":
			case "/stats": {
				this.panel.addUserMessage(text);
				const resp = await this.client.request<SessionStatsData>({ type: "get_session_stats" });
				const stats = resp.data;
				const percent = stats?.contextUsage?.percent !== undefined && stats?.contextUsage?.percent !== null ? `${stats.contextUsage.percent}%` : "0%";
				const tokens = stats?.tokens?.total ?? this.contextTokens ?? 0;
				const costStr = stats?.cost !== undefined ? `$${stats.cost.toFixed(4)}` : "$0.0000";
				const branchStr = this.gitInfo?.branch ? `${this.gitInfo.branch} (+${this.gitInfo.added ?? 0} -${this.gitInfo.removed ?? 0})` : "no git repo";

				this.panel.addEntry({ kind: "info", text: "=== TURBO-AI SESSION STATUS ===" });
				this.panel.addEntry({ kind: "info", text: `Session:      ${this.getEffectiveSessionName()}` });
				this.panel.addEntry({ kind: "info", text: `Active Model: ${this.model ?? "(none)"}` });
				this.panel.addEntry({ kind: "info", text: `Effort Level: ${this.thinkingLevel ?? "default"}` });
				this.panel.addEntry({ kind: "info", text: `Mode:         ${this.planMode ? "PLAN (Planning)" : "BUILD (Execution)"}` });
				this.panel.addEntry({ kind: "info", text: `Directory:    ${this.cwd}` });
				this.panel.addEntry({ kind: "info", text: `Context:      ${tokens} tokens (${percent})` });
				this.panel.addEntry({ kind: "info", text: `Est. Cost:    ${costStr}` });
				this.panel.addEntry({ kind: "info", text: `Git Status:   ${branchStr}` });
				this.flash("Status displayed");
				this.markDirty();
				return true;
			}

			case "/help":
			case "/?": {
				this.overlay = { kind: "help" };
				this.markDirty();
				return true;
			}

			case "/clear":
			case "/cls": {
				this.panel.clear();
				this.flash("Agent view cleared");
				this.markDirty();
				return true;
			}

			case "/compact": {
				this.panel.addUserMessage(text);
				void this.compactSession();
				return true;
			}

			case "/model": {
				if (!arg) {
					void this.openModelSelector();
				} else {
					let provider = "openrouter";
					let modelId = arg;
					if (arg.includes("/")) {
						const slash = arg.indexOf("/");
						provider = arg.slice(0, slash).trim();
						modelId = arg.slice(slash + 1).trim();
					}
					saveCustomModel(provider, { id: modelId, name: modelId, reasoning: true });
					void this.selectModel({ provider, id: modelId, name: modelId, api: provider, reasoning: true });
				}
				return true;
			}

			case "/effort":
			case "/thinking": {
				if (!arg) {
					void this.cycleThinkingLevel();
				} else {
					const level = parseThinkingLevel(arg);
					if (!level) {
						this.flash("Invalid effort. Use: off, minimal, low, medium, high, xhigh");
						this.panel.addEntry({ kind: "error", text: `Invalid thinking effort: ${arg}`, tag: "[ERROR]", isError: true });
						return true;
					}
					const setResp = await this.client.request({
						type: "set_thinking_level",
						level,
					});
					if (!setResp.success) {
						const message = setResp.error ?? "Failed to set thinking effort";
						this.flash(message);
						this.panel.addEntry({ kind: "error", text: message, tag: "[ERROR]", isError: true });
						return true;
					}
					this.syncCustomModelReasoning(level !== "off");
					this.thinkingLevel = level === "off" ? null : level;
					this.flash(`Thinking effort: ${level}`);
					this.panel.addEntry({ kind: "info", text: `Thinking effort set to: ${level}` });
					this.markDirty();
				}
				return true;
			}

			case "/plan": {
				if (!arg) {
					this.planMode = true;
					this.flash("Mode: PLAN (Planning & Architecture)");
					this.panel.addEntry({ kind: "info", text: "Active mode set to: PLAN" });
					this.markDirty();
					return true;
				}
				this.planMode = true;
				this.sendPrompt(arg);
				return true;
			}

			case "/build": {
				if (!arg) {
					this.planMode = false;
					this.flash("Mode: BUILD (Autonomous Execution)");
					this.panel.addEntry({ kind: "info", text: "Active mode set to: BUILD" });
					this.markDirty();
					return true;
				}
				this.planMode = false;
				this.sendPrompt(arg);
				return true;
			}

			case "/mode": {
				this.togglePlanBuildMode();
				return true;
			}

			case "/diff": {
				this.handleAction({ kind: "diff" });
				return true;
			}

			case "/test":
			case "/tests": {
				void this.runViaRpc("npm test");
				return true;
			}

			case "/run": {
				if (arg) {
					void this.runViaRpc(arg);
				} else {
					this.handleAction({ kind: "run" });
				}
				return true;
			}

			case "/save": {
				if (arg) {
					const target = path.resolve(this.cwd, arg.trim());
					const content = this.panel.getExportText();
					try {
						fs.writeFileSync(target, content, "utf8");
						const base = path.basename(target);
						this.addRecentSession({ label: base, path: target, kind: "transcript" });
						this.flash(`Session saved to ${base}`);
						this.panel.addEntry({ kind: "info", text: `Session saved: ${target}` });
					} catch (err: any) {
						this.flash(`Save failed: ${err.message}`);
					}
					this.markDirty();
				} else {
					this.saveSessionToFile();
				}
				return true;
			}

			case "/sessions":
			case "/session":
			case "/history": {
				if (arg) {
					const num = parseInt(arg, 10);
					if (!isNaN(num) && num >= 1 && num <= this.recentSessions.length) {
						const targetSession = this.recentSessions[num - 1];
						if (targetSession) {
							void this.loadRecentSession(targetSession.path);
							return true;
						}
					}
					void this.loadRecentSession(arg);
					return true;
				}
				this.openSessionSelector();
				return true;
			}

			case "/resume": {
				if (!arg) {
					this.openSessionSelector();
				} else {
					const num = parseInt(arg, 10);
					if (!isNaN(num) && num >= 1 && num <= this.recentSessions.length) {
						const targetSession = this.recentSessions[num - 1];
						if (targetSession) {
							void this.loadRecentSession(targetSession.path);
							return true;
						}
					}
					void this.loadRecentSession(arg);
				}
				return true;
			}

			case "/open": {
				if (arg) {
					void this.loadRecentSession(arg);
				} else {
					this.openSavedSession();
				}
				return true;
			}

			case "/new": {
				void this.newSession();
				return true;
			}

			case "/fork": {
				void this.forkSessionPrompt();
				return true;
			}

			case "/tree":
			case "/files": {
				this.focus = "tree";
				this.flash("Active window: FILES");
				this.markDirty();
				return true;
			}

			case "/export": {
				void this.exportSession();
				return true;
			}

			case "/exit":
			case "/quit": {
				this.exit();
				return true;
			}
		}

		return false;
	}

	private sendPrompt(text: string): void {
		let fullPrompt = text;
		if (this.planMode) {
			fullPrompt = `[PLAN MODE: Focus on analysis, architecture and step-by-step design without modifying code yet]\n${text}`;
		}
		this.panel.addUserMessage(text);
		this.isStreaming = true;
		this.requestStart = Date.now();
		this.startSpinner();
		this.client.send({ type: "prompt", message: fullPrompt });
		this.markDirty();
	}

	private togglePlanBuildMode(): void {
		this.planMode = !this.planMode;
		const label = this.planMode ? "PLAN (Planning & Architecture)" : "BUILD (Autonomous Execution)";
		this.flash(`Mode: ${label}`);
		this.panel.addEntry({ kind: "info", text: `Active mode changed to: ${label}` });
		this.markDirty();
	}

	private saveSessionToFile(): void {
		const defaultName = `${this.getEffectiveSessionName().replace(/\.PAS$/i, "")}.md`;
		this.openPrompt("Save Session As", defaultName, (filename) => {
			if (!filename.trim()) return;
			const target = path.resolve(this.cwd, filename.trim());
			const content = this.panel.getExportText();
			try {
				fs.writeFileSync(target, content, "utf8");
				const base = path.basename(target);
				this.addRecentSession({ label: base, path: target, kind: "transcript" });
				this.flash(`Session saved to ${base}`);
				this.panel.addEntry({ kind: "info", text: `Session saved: ${target}` });
			} catch (err: any) {
				this.flash(`Save failed: ${err.message}`);
			}
			this.markDirty();
		});
	}

	private openSessionSelector(): void {
		const { cols, rows } = this.term.size();
		const selector = new SessionSelector(cols, rows);
		selector.setLoading();
		this.overlay = { kind: "session", selector };
		this.markDirty();
		void getProjectSessions(this.cwd).then(
			(sessions) => {
				if (this.overlay?.kind !== "session" || this.overlay.selector !== selector) return;
				selector.setSessions(sessions);
				this.markDirty();
			},
			(err: unknown) => {
				if (this.overlay?.kind !== "session" || this.overlay.selector !== selector) return;
				selector.setError(err instanceof Error ? err.message : String(err));
				this.markDirty();
			},
		);
	}

	private openSavedSession(): void {
		this.openSessionSelector();
	}

	private async loadRecentSession(name: string): Promise<void> {
		const target = path.resolve(this.cwd, name);
		if (target.endsWith(".jsonl") && fs.existsSync(target)) {
			let parsed;
			try {
				parsed = parseJsonlSession(target);
			} catch (err: unknown) {
				this.flash(err instanceof Error ? err.message : String(err));
				return;
			}
			const resp = await this.client.request({ type: "switch_session", sessionPath: target });
			if (resp.success) {
				this.panel.clear();
				for (const entry of parsed.entries) this.panel.addEntry(entry);
				this.panel.scrollToBottom();
				if (parsed.model) this.model = parsed.model;
				if (parsed.thinkingLevel) this.thinkingLevel = parsed.thinkingLevel === "off" ? null : parsed.thinkingLevel;
				const base = parsed.title || path.basename(target).toUpperCase();
				this.sessionName = base;
				this.addRecentSession({ label: base, path: target, kind: "pi" });
				this.flash(`Session resumed: ${base}`);
				void this.pollStats();
			} else {
				this.flash(resp.error ?? "Failed to switch session in Pi");
			}
			this.markDirty();
			return;
		}

		if (fs.existsSync(target) && fs.statSync(target).isFile()) {
			try {
				const preview = readPreview(target, 5000);
				if (!preview) throw new Error("Transcript is too large or unreadable");
				const base = path.basename(target);
				const { cols, rows } = this.term.size();
				const lines = preview.truncated ? [...preview.lines, "... (truncated)"] : preview.lines;
				this.overlay = { kind: "text", popup: new TextPopup(cols, rows, `Transcript: ${base}`, lines) };
				this.addRecentSession({ label: base, path: target, kind: "transcript" });
				this.flash(`Transcript opened: ${base}`);
			} catch (err: unknown) {
				this.flash(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		} else {
			this.flash(`Session not found: ${name}`);
		}
		this.markDirty();
	}

	private toggleZoom(): void {
		if (this.overlay?.kind === "text") {
			if (this.layout) this.overlay.popup.toggleZoom(this.layout.cols, this.layout.rows);
			return;
		}
		if (this.overlay?.kind === "diff") {
			if (this.layout) this.overlay.viewer.toggleZoom(this.layout.cols, this.layout.rows);
			return;
		}
		if (this.zoomedWindow) {
			this.zoomedWindow = null;
			this.flash("Windows restored");
		} else {
			this.zoomedWindow = this.focus === "tree" ? "tree" : "agent";
			this.flash(`${this.zoomedWindow.toUpperCase()} maximized (click [▲] to restore)`);
		}
		this.markDirty();
	}

	private abortAgent(): void {
		if (!this.isStreaming) {
			this.flash("No operation in progress");
			return;
		}
		this.client.send({ type: "abort" });
		this.isStreaming = false;
		this.requestStart = null;
		this.stopSpinner();
		this.flash("Abort requested");
	}

	private async newSession(): Promise<void> {
		const resp = await this.client.request({ type: "new_session" });
		if (resp.success) {
			this.sessionCounter++;
			this.sessionName = null;
			this.panel.clear();
			const sessName = this.getEffectiveSessionName();
			this.panel.setStatus(`New session started (${sessName}).`);
			void this.pollStats();
		} else {
			this.flash(resp.error ?? "Failed to start new session");
		}
		this.markDirty();
	}

	private async openModelSelector(): Promise<void> {
		const { cols, rows } = this.term.size();
		const selector = new ModelSelector(cols, rows);
		this.overlay = { kind: "model", selector };

		if (this.modelsCache) {
			selector.setModels(this.modelsCache);
			return;
		}
		selector.renderLoading(this.screen, "Loading models...");
		this.screen.flush();
		const resp = await this.client.request<{ models: ModelInfo[] }>({ type: "get_available_models" });
		if (resp.success && resp.data?.models) {
			this.modelsCache = filterEnabledModels(resp.data.models);
			selector.setModels(this.modelsCache);
		} else {
			selector.renderError(this.screen, resp.error ?? "Unable to list models");
		}
		this.markDirty();
	}

	private openProviderDialog(): void {
		const { cols, rows } = this.term.size();
		this.overlay = { kind: "providerConfig", dialog: new ProviderDialog(cols, rows, this.cwd) };
		this.markDirty();
	}

	private openEditApiKey(provider: ProviderEntry | null): void {
		if (!provider) return;
		const curVal = readEnvKey(this.cwd, provider.envVar) ?? "";
		this.openPrompt(`Set ${provider.name} API Key`, curVal, (newKey) => {
			try {
				writeEnvKey(this.cwd, provider.envVar, newKey.trim());
				this.modelsCache = null;
				this.flash(`Saved ${provider.envVar}. Models updated.`);
				this.panel.addEntry({ kind: "info", text: `Updated ${provider.envVar} in .env` });
			} catch (err: unknown) {
				this.flash(`Failed to save key: ${err instanceof Error ? err.message : String(err)}`);
			}
			this.openProviderDialog();
		}, { secret: true });
	}

	private openAddModelDialog(initialProvider = "openrouter"): void {
		const { cols, rows } = this.term.size();
		this.overlay = { kind: "addModel", dialog: new AddModelDialog(cols, rows, initialProvider) };
		this.markDirty();
	}

	private saveAndApplyCustomModel(res: AddModelResult | null): void {
		if (!res || !res.modelId.trim()) {
			this.closeOverlay();
			return;
		}
		try {
			saveCustomModel(res.provider, {
				id: res.modelId.trim(),
				name: res.name.trim() || res.modelId.trim(),
				reasoning: res.reasoning,
			});
			this.modelsCache = null;
			this.flash(`Custom model ${res.provider}/${res.modelId} saved.`);
			this.panel.addEntry({ kind: "info", text: `Registered custom model: ${res.provider}/${res.modelId}` });
			this.closeOverlay();
			void this.selectModel({
				provider: res.provider,
				id: res.modelId.trim(),
				name: res.name.trim(),
				api: res.provider,
				reasoning: res.reasoning,
			});
		} catch (err: any) {
			this.flash(`Failed to save model: ${err.message}`);
		}
		this.markDirty();
	}

	private async reloadAvailableModels(): Promise<void> {
		this.flash("Reloading models from Pi...");
		this.modelsCache = null;
		const resp = await this.client.request<{ models: ModelInfo[] }>({ type: "get_available_models" });
		if (resp.success && resp.data?.models) {
			this.modelsCache = filterEnabledModels(resp.data.models);
			this.flash(`Reloaded ${this.modelsCache.length} available models.`);
			this.panel.addEntry({ kind: "info", text: `Reloaded ${this.modelsCache.length} available models from Pi.` });
		} else {
			this.flash(resp.error ?? "Failed to reload models");
		}
		this.markDirty();
	}

	private async selectModel(m: ModelInfo): Promise<void> {
		if (m.id === "__custom__") {
			this.openPrompt("Enter Model (provider/model-id):", "", (input) => {
				if (!input.trim()) return;
				const raw = input.trim();
				let provider = "openrouter";
				let modelId = raw;
				if (raw.includes("/")) {
					const slash = raw.indexOf("/");
					provider = raw.slice(0, slash).trim();
					modelId = raw.slice(slash + 1).trim();
				}
				void this.selectModel({ provider, id: modelId, name: modelId, api: provider });
			});
			return;
		}

		const resp = await this.client.request({
			type: "set_model",
			provider: m.provider,
			modelId: m.id,
			model: m.id,
		});
		this.flash(resp.success ? `Model: ${m.provider}/${m.id}` : `Set model failed: ${resp.error ?? "?"}`);
		if (resp.success) {
			this.model = `${m.provider}/${m.id}`;
			void this.pollStats();
		} else {
			this.panel.addEntry({ kind: "error", text: `Set model failed: ${resp.error ?? "unknown error"}`, tag: "[ERROR]", isError: true });
		}
		this.markDirty();
	}

	private async runViaRpc(command: string): Promise<void> {
		if (this.isBash) {
			this.flash("A command is already running");
			return;
		}
		this.isBash = true;
		this.requestStart = Date.now();
		this.startSpinner();
		this.panel.addEntry({ kind: "tool", text: command, tag: "[RUN]", isError: false });
		this.markDirty();
		const resp = await this.client.request<{ output?: string; exitCode?: number; cancelled?: boolean }>(
			{ type: "bash", command },
			600000,
		);
		this.isBash = false;
		this.requestStart = null;
		this.stopSpinner();
		if (resp.success && resp.data) {
			const ok = resp.data.exitCode === 0;
			const outLine = firstRealLine(resp.data.output ?? "");
			this.panel.addEntry({
				kind: ok ? "tool" : "error",
				text: outLine ? `exit ${resp.data.exitCode}: ${outLine}` : `exit ${resp.data.exitCode}`,
				tag: ok ? "[OK]" : "[ERROR]",
				isError: !ok,
			});
		} else {
			this.panel.addEntry({ kind: "error", text: resp.error ?? "command failed", tag: "[ERROR]", isError: true });
		}
		void this.pollGit();
		this.markDirty();
	}

	private async showGitStatus(): Promise<void> {
		await this.pollGit();
		const info = this.gitInfo;
		const lines: string[] = [];
		if (!info.isRepo) {
			lines.push("Not a git repository.");
		} else {
			lines.push(`Branch: ${info.branch ?? "?"}`);
			lines.push("");
			if (info.dirtyFiles.length === 0) lines.push("Working tree clean.");
			else {
				lines.push(`Changed files (${info.dirtyFiles.length}):`);
				for (const f of info.dirtyFiles.slice(0, 40)) lines.push(`  M ${f}`);
				if (info.dirtyFiles.length > 40) lines.push(`  ... and ${info.dirtyFiles.length - 40} more`);
			}
		}
		const { cols, rows } = this.term.size();
		this.overlay = { kind: "text", popup: new TextPopup(cols, rows, "Git status", lines) };
		this.markDirty();
	}

	private async showDiff(): Promise<void> {
		let diffText: string;
		try {
			diffText = await gitDiff(this.cwd);
		} catch {
			this.flash("Not a git repository or git unavailable");
			return;
		}
		const { cols, rows } = this.term.size();
		const viewer = new DiffViewer(cols, rows, "Diff: working tree");
		viewer.setDiff(parseUnifiedDiff(diffText));
		this.overlay = { kind: "diff", viewer };
		this.markDirty();
	}

	private previewSelectedFile(): void {
		const node = this.tree.selected;
		if (!node || node.isDir) return;
		const preview = readPreview(node.fullPath, 500);
		const { cols, rows } = this.term.size();
		if (!preview) {
			this.overlay = { kind: "text", popup: new TextPopup(cols, rows, node.name, ["(binary or unreadable file)"]) };
		} else {
			const lines = preview.truncated ? [...preview.lines, "... (truncated)"] : preview.lines;
			this.overlay = { kind: "text", popup: new TextPopup(cols, rows, node.name, lines) };
		}
		this.markDirty();
	}

	private changeDirectory(): void {
		this.openPrompt("Change Directory", this.cwd, (newDir) => {
			void this.switchWorkingDirectory(newDir);
		});
	}

	private async switchWorkingDirectory(newDir: string): Promise<void> {
		if (this.isStreaming || this.isBash) {
			this.flash("Finish or abort the active operation before changing directory");
			return;
		}
		const target = path.resolve(this.cwd, newDir.trim());
		try {
			if (!fs.statSync(target).isDirectory()) throw new Error("not a directory");
		} catch {
			this.flash(`Invalid directory: ${target}`);
			return;
		}
		if (path.resolve(this.cwd) === target) {
			this.flash(`Already using: ${target}`);
			return;
		}

		this.flash(`Connecting Pi in ${target}...`);
		const candidate = this.clientFactory(target);
		try {
			await candidate.start();
			const state = await this.getClientState(candidate);
			if (!state.success || !state.data) throw new Error(state.error ?? "Unable to initialize Pi in the selected directory");

			const previous = this.client;
			this.unbindClient(previous);
			this.client = candidate;
			this.bindClient(candidate);
			previous.dispose();

			this.cwd = target;
			this.tree.setBaseDir(target);
			this.panel.clear();
			this.model = state.data.model ? `${state.data.model.provider}/${state.data.model.id}` : null;
			this.thinkingLevel = state.data.thinkingLevel === "off" ? null : state.data.thinkingLevel ?? null;
			this.sessionName = state.data.sessionName ?? null;
			this.contextTokens = null;
			this.modelsCache = null;
			this.recentSessions = [];
			this.menuBar.setRecentSessions([]);
			this.isStreaming = false;
			this.isBash = false;
			this.requestStart = null;
			this.panel.setStatus(`Connected in ${target}. Session: ${state.data.sessionId ?? "(new)"}`);
			await Promise.all([this.pollStats(), this.pollGit()]);
			this.flash(`Working directory: ${target}`);
		} catch (err: unknown) {
			candidate.dispose();
			const message = err instanceof Error ? err.message : String(err);
			this.panel.addEntry({ kind: "error", text: `Change directory failed: ${message}`, tag: "[ERROR]", isError: true });
			this.flash(`Change directory failed: ${message}`);
		}
		this.markDirty();
	}

	private async exportSession(): Promise<void> {
		this.flash("Exporting session to HTML...");
		const resp = await this.client.request<{ path?: string }>({ type: "export_html" });
		if (resp.success && resp.data?.path) {
			this.flash(`Exported to ${resp.data.path}`);
			this.panel.addEntry({ kind: "info", text: `Session exported to: ${resp.data.path}` });
		} else {
			this.flash(resp.error ?? "Failed to export session");
		}
		this.markDirty();
	}

	private clearInputLine(): void {
		this.input.clear();
		this.flash("Message input line cleared");
		this.markDirty();
	}

	private async showLastAssistantText(): Promise<void> {
		const resp = await this.client.request<{ text?: string | null }>({ type: "get_last_assistant_text" });
		const { cols, rows } = this.term.size();
		if (!resp.success || !resp.data?.text) {
			this.overlay = {
				kind: "text",
				popup: new TextPopup(cols, rows, "Last Assistant Response", [resp.error ?? "No assistant messages in session."]),
			};
		} else {
			const lines = resp.data.text.split(/\r?\n/);
			this.overlay = { kind: "text", popup: new TextPopup(cols, rows, "Last Assistant Response", lines) };
		}
		this.markDirty();
	}

	private clearSearchFilter(): void {
		this.tree.setFilter(null);
		this.flash("File filter cleared (showing all files)");
		this.markDirty();
	}

	private grepSearch(): void {
		this.openPrompt("Search Text in Files (Grep)", "", (query) => {
			if (!query.trim()) return;
			void this.showGrepResults(query.trim());
		});
	}

	private async showGrepResults(query: string): Promise<void> {
		this.flash(`Searching for: ${query}`);
		try {
			const lines = await gitGrep(this.cwd, query);
			const { cols, rows } = this.term.size();
			this.overlay = { kind: "text", popup: new TextPopup(cols, rows, `Search: ${query}`, lines) };
		} catch (err: unknown) {
			this.flash(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
		}
		this.markDirty();
	}

	private abortRunningCommand(): void {
		if (this.isBash) {
			this.client.send({ type: "abort_bash" });
			this.isBash = false;
			this.requestStart = null;
			this.stopSpinner();
			this.flash("Command aborted");
			this.markDirty();
			return;
		}
		if (this.isStreaming) {
			this.abortAgent();
			return;
		}
		this.flash("No command running");
	}

	private async cycleModel(): Promise<void> {
		const resp = await this.client.request<{ model?: ModelInfo }>({ type: "cycle_model" });
		if (resp.success && resp.data?.model) {
			this.model = `${resp.data.model.provider}/${resp.data.model.id}`;
			this.flash(`Model: ${this.model}`);
			void this.pollStats();
		} else {
			this.flash(resp.error ?? "Cycle model failed");
		}
		this.markDirty();
	}

	private async cycleThinkingLevel(): Promise<void> {
		// 1. Try standard cycle_thinking_level RPC
		const resp = await this.client.request<{ level?: string }>({ type: "cycle_thinking_level" });
		const cycledLevel = resp.data?.level ? parseThinkingLevel(resp.data.level) : null;
		if (resp.success && cycledLevel) {
			this.thinkingLevel = cycledLevel === "off" ? null : cycledLevel;
			this.syncCustomModelReasoning(cycledLevel !== "off");
			this.flash(`Thinking level: ${cycledLevel}`);
			this.panel.addEntry({ kind: "info", text: `Thinking level set to: ${cycledLevel}` });
			this.markDirty();
			return;
		}

		// 2. Fallback: cycle through levels [low, medium, high, off] and explicitly set via set_thinking_level
		const levels: ThinkingLevel[] = ["low", "medium", "high", "off"];
		const currentLevel = this.thinkingLevel ? parseThinkingLevel(this.thinkingLevel) : null;
		const curIdx = currentLevel ? levels.indexOf(currentLevel) : -1;
		const nextLevel = levels[(curIdx + 1) % levels.length]!;

		const setResp = await this.client.request<{ level?: string }>({
			type: "set_thinking_level",
			level: nextLevel,
		});
		if (!setResp.success) {
			const message = setResp.error ?? "Failed to cycle thinking effort";
			this.flash(message);
			this.panel.addEntry({ kind: "error", text: message, tag: "[ERROR]", isError: true });
			this.markDirty();
			return;
		}

		this.thinkingLevel = nextLevel === "off" ? null : nextLevel;
		this.syncCustomModelReasoning(nextLevel !== "off");
		const displayMsg = `Thinking effort set to: ${nextLevel}`;
		this.flash(displayMsg);
		this.panel.addEntry({ kind: "info", text: displayMsg });
		this.markDirty();
	}

	private syncCustomModelReasoning(enabled: boolean): void {
		if (!this.model?.includes("/")) return;
		const slash = this.model.indexOf("/");
		try {
			setCustomModelReasoning(this.model.slice(0, slash), this.model.slice(slash + 1), enabled);
		} catch (err: unknown) {
			this.panel.addEntry({
				kind: "error",
				text: `Could not update models.json reasoning flag: ${err instanceof Error ? err.message : String(err)}`,
				tag: "[ERROR]",
				isError: true,
			});
		}
	}

	private async compactSession(): Promise<void> {
		this.flash("Compacting context memory...");
		const resp = await this.client.request<{ summary?: string; tokensBefore?: number }>({ type: "compact" });
		if (resp.success && resp.data) {
			const msg = resp.data.tokensBefore
				? `Context compacted (was ${resp.data.tokensBefore} tokens)`
				: "Context memory compacted.";
			this.flash(msg);
			this.panel.addEntry({ kind: "info", text: msg });
			void this.pollStats();
		} else {
			this.flash(resp.error ?? "Compaction failed");
		}
		this.markDirty();
	}

	private async forkSessionPrompt(): Promise<void> {
		const resp = await this.client.request<{ messages?: Array<{ entryId: string; text: string }> }>({
			type: "get_fork_messages",
		});
		if (!resp.success || !resp.data?.messages || resp.data.messages.length === 0) {
			this.flash("No previous prompts available to fork");
			return;
		}
		const lastMsg = resp.data.messages[resp.data.messages.length - 1];
		if (!lastMsg) return;
		const forkResp = await this.client.request({ type: "fork", entryId: lastMsg.entryId });
		if (forkResp.success) {
			this.flash(`Forked session branch from: "${lastMsg.text.slice(0, 25)}..."`);
			this.panel.clear();
			this.panel.setStatus("Forked into new branch.");
			void this.pollStats();
		} else {
			this.flash(forkResp.error ?? "Fork failed");
		}
		this.markDirty();
	}

	private async cloneSessionBranch(): Promise<void> {
		const resp = await this.client.request({ type: "clone" });
		if (resp.success) {
			this.flash("Active branch cloned into new session");
			this.panel.setStatus("Session cloned into new file.");
		} else {
			this.flash(resp.error ?? "Clone failed");
		}
		this.markDirty();
	}

	private async showGitLog(): Promise<void> {
		const lines = await gitLog(this.cwd, 30);
		const { cols, rows } = this.term.size();
		this.overlay = { kind: "text", popup: new TextPopup(cols, rows, "Git Commit History", lines) };
		this.markDirty();
	}

	private renameSession(): void {
		this.openPrompt("Rename Session", "", async (name) => {
			if (!name.trim()) return;
			const resp = await this.client.request({ type: "set_session_name", name: name.trim() });
			if (resp.success) {
				this.sessionName = name.trim();
				this.flash(`Session renamed: "${name.trim()}"`);
				this.panel.addEntry({ kind: "info", text: `Session name: ${name.trim()}` });
			} else {
				this.flash(resp.error ?? "Failed to rename session");
			}
			this.markDirty();
		});
	}

	private showEnvInfo(): void {
		const { cols, rows } = this.term.size();
		const lines = getSystemInfo(this.cwd, cols, rows);
		this.overlay = { kind: "text", popup: new TextPopup(cols, rows, "Environment Information", lines) };
		this.markDirty();
	}

	private autoCompactionState = true;
	private async toggleAutoCompaction(): Promise<void> {
		this.autoCompactionState = !this.autoCompactionState;
		await this.client.request({ type: "set_auto_compaction", enabled: this.autoCompactionState });
		this.flash(`Auto-compaction: ${this.autoCompactionState ? "ENABLED" : "DISABLED"}`);
		this.markDirty();
	}

	private autoRetryState = true;
	private async toggleAutoRetry(): Promise<void> {
		this.autoRetryState = !this.autoRetryState;
		await this.client.request({ type: "set_auto_retry", enabled: this.autoRetryState });
		this.flash(`Auto-retry on error: ${this.autoRetryState ? "ENABLED" : "DISABLED"}`);
		this.markDirty();
	}

	private steeringMode: "all" | "one-at-a-time" = "one-at-a-time";
	private async toggleSteeringMode(): Promise<void> {
		this.steeringMode = this.steeringMode === "all" ? "one-at-a-time" : "all";
		await this.client.request({ type: "set_steering_mode", mode: this.steeringMode });
		this.flash(`Steering delivery mode: ${this.steeringMode}`);
		this.markDirty();
	}

	private followUpMode: "all" | "one-at-a-time" = "one-at-a-time";
	private async toggleFollowUpMode(): Promise<void> {
		this.followUpMode = this.followUpMode === "all" ? "one-at-a-time" : "all";
		await this.client.request({ type: "set_follow_up_mode", mode: this.followUpMode });
		this.flash(`Follow-up delivery mode: ${this.followUpMode}`);
		this.markDirty();
	}

	private tileWindows(): void {
		this.zoomedWindow = null;
		this.flash("Tiled 3-pane layout restored");
		this.markDirty();
	}

	private showGuide(): void {
		const { cols, rows } = this.term.size();
		const lines = [
			"TURBO-AI User & Command Guide",
			"═".repeat(45),
			"Primary commands:",
			"  F1          Open keyboard help",
			"  F2          Save conversation transcript",
			"  F3          Open or resume a saved session",
			"  F4          Open AI model selector",
			"  F5          Cycle thinking effort",
			"  F6          Toggle PLAN / BUILD mode",
			"  F7          Open unified Git diff",
			"  F8          Run project test suite (npm test)",
			"  F9          Build project artifacts (npm run build)",
			"  F10         Activate top menu bar",
			"",
			"Navigation & editing:",
			"  Tab         Switch between FILES, AGENT, and MESSAGE",
			"  Ctrl+C      Abort active AI generation or command",
			"  Ctrl+L      Clear message history from AGENT screen",
			"  Ctrl+F      Filter and find files in tree",
			"  Alt+X       Cleanly exit to DOS / shell",
			"",
			"Menu Shortcuts:",
			"  Alt+F       File menu       Alt+G  Git menu",
			"  Alt+E       Edit menu       Alt+T  Tools menu",
			"  Alt+S       Search menu     Alt+O  Options menu",
			"  Alt+R       Run menu        Alt+W  Window menu",
			"  Alt+A       Agent menu      Alt+H  Help menu",
		];
		this.overlay = { kind: "text", popup: new TextPopup(cols, rows, "Pi & IDE Guide", lines) };
		this.markDirty();
	}

	private async showStats(): Promise<void> {
		const resp = await this.client.request<SessionStatsData & Record<string, unknown>>({ type: "get_session_stats" });
		const { cols, rows } = this.term.size();
		if (!resp.success || !resp.data) {
			this.overlay = { kind: "text", popup: new TextPopup(cols, rows, "Session stats", [resp.error ?? "Unavailable"]) };
			this.markDirty();
			return;
		}
		const d = resp.data;
		const cu = d.contextUsage;
		const lines = [
			`Messages:      ${d.totalMessages ?? "?"}`,
			`Tool calls:    ${d.toolCalls ?? "?"}`,
			`Tokens total:  ${d.tokens?.total ?? "?"}`,
			`  input:       ${d.tokens?.input ?? "?"}`,
			`  output:      ${d.tokens?.output ?? "?"}`,
			cu ? `Context:       ${cu.tokens ?? "?"} / ${cu.contextWindow} (${cu.percent ?? "?"}%)` : "Context:       n/a",
			`Cost:          ${typeof d.cost === "number" ? "$" + d.cost.toFixed(4) : "?"}`,
		];
		this.overlay = { kind: "text", popup: new TextPopup(cols, rows, "Session stats", lines) };
		this.markDirty();
	}

	// ----------------------------------------------------------------- exit

	private exit(): void {
		this.cleanup();
		process.exit(0);
	}

	private cleanup(): void {
		if (this.closed) return;
		this.closed = true;
		this.stopSpinner();
		if (this.activityTimer) clearInterval(this.activityTimer);
		if (this.gitPollTimer) clearInterval(this.gitPollTimer);
		if (this.statusMessageTimer) clearTimeout(this.statusMessageTimer);
		this.activityTimer = null;
		this.gitPollTimer = null;
		this.statusMessageTimer = null;
		process.removeListener("exit", this.processExitHandler);
		process.removeListener("SIGINT", this.sigintHandler);
		process.removeListener("SIGTERM", this.sigtermHandler);
		this.unbindClient(this.client);
		this.client.dispose();
		this.screen.stop();
		this.term.leave();
	}
}

function firstRealLine(output: string): string {
	const line = output.split("\n").map((l) => l.trimEnd()).find((l) => l.length > 0);
	if (!line) return "";
	return line.length > 120 ? line.slice(0, 119) + "\u2026" : line;
}

// ----------------------------------------------------------------------------

export function runCli(args = process.argv.slice(2), defaultCwd = process.cwd()): void {
	const cli = parseCliArgs(args, defaultCwd);
	if (cli.error) {
		console.error(`${cli.error}\n${CLI_USAGE}`);
		process.exitCode = 2;
		return;
	}
	if (cli.help) {
		console.log(CLI_USAGE);
		return;
	}
	const app = new App(cli.cwd);
	app.run().catch((err) => {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	});
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryPath === import.meta.url) runCli();
