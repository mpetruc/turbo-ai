import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { toolTag, toolSummary, type AgentEntry } from "../rpc/events.js";

/** Read `enabledModels` from Pi's settings.json. Returns null when unavailable/empty. */
export function readEnabledModels(): string[] | null {
	try {
		const settingsPath = path.join(process.env.PI_CONFIG_DIR ?? path.join(os.homedir(), ".pi", "agent"), "settings.json");
		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
		if (!Array.isArray(settings.enabledModels) || settings.enabledModels.length === 0) return null;
		return settings.enabledModels.filter((m: unknown): m is string => typeof m === "string");
	} catch {
		return null;
	}
}

/** Filter a model list down to Pi's enabledModels. Falls back to the full list. */
export function filterEnabledModels<T extends { provider: string; id: string }>(models: T[]): T[] {
	const enabled = readEnabledModels();
	if (!enabled) return models;
	const set = new Set(enabled);
	const filtered = models.filter((m) => set.has(`${m.provider}/${m.id}`));
	return filtered.length > 0 ? filtered : models;
}

export interface GitInfo {
	branch: string | null;
	added: number | null;
	removed: number | null;
	dirtyFiles: string[];
	isRepo: boolean;
}

function exec(cmd: string, args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { cwd, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
			if (err) reject(err);
			else resolve(stdout);
		});
	});
}

function parseNumstat(output: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of output.split("\n")) {
		const [a, r] = line.split("\t");
		if (a && /^\d+$/.test(a)) added += Number.parseInt(a, 10);
		if (r && /^\d+$/.test(r)) removed += Number.parseInt(r, 10);
	}
	return { added, removed };
}

/** Collect real git information for the status bar / Git menu. Null-safe when not a repo. */
export async function collectGitInfo(cwd: string): Promise<GitInfo> {
	const empty: GitInfo = { branch: null, added: null, removed: null, dirtyFiles: [], isRepo: false };
	try {
		const status = await exec("git", ["status", "--porcelain=v1", "-z", "-b"], cwd);
		const records = status.split("\0").filter(Boolean);
		let branch: string | null = null;
		const dirtyFiles: string[] = [];
		for (let index = 0; index < records.length; index++) {
			const record = records[index]!;
			if (record.startsWith("## ")) {
				const value = record.slice(3);
				if (value.startsWith("No commits yet on ")) branch = value.slice("No commits yet on ".length);
				else if (value.startsWith("Initial commit on ")) branch = value.slice("Initial commit on ".length);
				else if (value.startsWith("HEAD (no branch)")) branch = "(detached)";
				else branch = value.split("...")[0] ?? null;
			} else {
				dirtyFiles.push(record.slice(3));
				if (record[0] === "R" || record[0] === "C" || record[1] === "R" || record[1] === "C") index++;
			}
		}
		let added: number | null = null;
		let removed: number | null = null;
		try {
			const numstat = await exec("git", ["diff", "HEAD", "--numstat"], cwd);
			({ added, removed } = parseNumstat(numstat));
			if (added === 0 && removed === 0) {
				added = null;
				removed = null;
			}
		} catch {
			try {
				const [staged, unstaged] = await Promise.all([
					exec("git", ["diff", "--cached", "--numstat"], cwd),
					exec("git", ["diff", "--numstat"], cwd),
				]);
				const stagedStats = parseNumstat(staged);
				const unstagedStats = parseNumstat(unstaged);
				added = stagedStats.added + unstagedStats.added;
				removed = stagedStats.removed + unstagedStats.removed;
				if (added === 0 && removed === 0) {
					added = null;
					removed = null;
				}
			} catch {
				added = null;
				removed = null;
			}
		}
		return { branch, added, removed, dirtyFiles, isRepo: true };
	} catch {
		return empty;
	}
}

export async function gitDiff(cwd: string): Promise<string> {
	try {
		return await exec("git", ["diff", "HEAD", "-U2"], cwd);
	} catch {
		return await exec("git", ["diff", "-U2"], cwd);
	}
}

export async function gitGrep(cwd: string, query: string): Promise<string[]> {
	return await new Promise((resolve, reject) => {
		execFile("git", ["grep", "-n", "-F", "--", query], { cwd, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
			const exitCode = typeof (err as NodeJS.ErrnoException & { code?: number } | null)?.code === "number"
				? (err as unknown as { code: number }).code
				: null;
			if (!err || exitCode === 1) {
				const lines = stdout.split(/\r?\n/).filter(Boolean);
				resolve(lines.length > 0 ? lines : ["No matches found."]);
				return;
			}
			reject(new Error(stderr.trim() || err.message));
		});
	});
}

export async function gitBranch(cwd: string): Promise<string | null> {
	try {
		const out = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
		return out.trim() || null;
	} catch {
		return null;
	}
}

/** Read the first maxLines of a file for the read-only preview popup. */
export function readPreview(filePath: string, maxLines: number, maxLineLen = 200): { lines: string[]; truncated: boolean } | null {
	try {
		const stat = fs.statSync(filePath);
		if (stat.size > 1024 * 1024) return null;
		const content = fs.readFileSync(filePath, "utf8");
		const all = content.split(/\r?\n/);
		return { lines: all.slice(0, maxLines).map((l) => l.slice(0, maxLineLen)), truncated: all.length > maxLines };
	} catch {
		return null;
	}
}

/** Get recent git commit history for popup display. */
export async function gitLog(cwd: string, maxCommits = 30): Promise<string[]> {
	try {
		const out = await exec("git", ["log", `-${maxCommits}`, "--pretty=format:%h  %ad  %s", "--date=short"], cwd);
		const lines = out.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
		return lines.length > 0 ? lines : ["No commits found in this repository."];
	} catch (err) {
		return ["Not a git repository or git log failed."];
	}
}

/** Get system, node, and environment metrics for Tools -> Environment info popup. */
export function getSystemInfo(cwd: string, cols: number, rows: number): string[] {
	const mem = process.memoryUsage();
	const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
	const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
	const rssMb = Math.round(mem.rss / 1024 / 1024);
	const heapMb = Math.round(mem.heapUsed / 1024 / 1024);

	return [
		"TURBO-AI System & Environment Information",
		"═".repeat(45),
		`Product:       Turbo-AI (Turbo Pascal 7.0 TUI for Pi)`,
		`Platform:      ${os.type()} ${os.release()} (${os.arch()})`,
		`Node.js:       ${process.version}`,
		`Process PID:   ${process.pid}`,
		`Working Dir:   ${cwd}`,
		`Terminal:      ${cols} x ${rows} cols/rows (TTY: ${process.stdin.isTTY ? "yes" : "no"})`,
		"",
		"Memory Usage:",
		`  Process RSS: ${rssMb} MB (Heap: ${heapMb} MB)`,
		`  System RAM:  ${freeMemMb} MB free / ${totalMemMb} MB total`,
		"",
		"Pi Backend:",
		`  RPC Mode:    Subprocess JSONL (stdio)`,
		`  Config Dir:  ${process.env.PI_CONFIG_DIR ?? path.join(os.homedir(), ".pi", "agent")}`,
	];
}

/** Copy text to system clipboard using OSC 52 and OS clipboard utilities (clip.exe / pbcopy / xclip). */
export function copyToClipboard(text: string): boolean {
	if (!text) return false;
	try {
		// 1. OSC 52 sequence (instant in modern terminal emulators)
		const base64 = Buffer.from(text, "utf8").toString("base64");
		process.stdout.write(`\x1b]52;c;${base64}\x07`);
	} catch {}

	try {
		if (process.platform === "win32") {
			const proc = spawn("clip.exe", [], { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
			proc.stdin.write(text);
			proc.stdin.end();
		} else if (process.platform === "darwin") {
			const proc = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
			proc.stdin.write(text);
			proc.stdin.end();
		} else {
			const proc = spawn("xclip", ["-selection", "clipboard"], { stdio: ["pipe", "ignore", "ignore"] });
			proc.stdin.write(text);
			proc.stdin.end();
		}
		return true;
	} catch {
		return true;
	}
}

/** Parse a simple .env file into key-value map. */
export function parseEnvFile(content: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const k = line.slice(0, eq).trim();
		let v = line.slice(eq + 1).trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
			v = v.slice(1, -1);
		}
		if (k) out[k] = v;
	}
	return out;
}

/** Read an API key from process.env, local .env, or Pi home .env. */
export function readEnvKey(cwd: string, envVar: string): string | null {
	if (process.env[envVar] && process.env[envVar]!.trim().length > 0) {
		return process.env[envVar]!.trim();
	}
	const localEnv = path.join(cwd, ".env");
	if (fs.existsSync(localEnv)) {
		try {
			const map = parseEnvFile(fs.readFileSync(localEnv, "utf8"));
			if (map[envVar]) return map[envVar]!;
		} catch {}
	}
	const piEnv = path.join(process.env.PI_CONFIG_DIR ?? path.join(os.homedir(), ".pi", "agent"), ".env");
	if (fs.existsSync(piEnv)) {
		try {
			const map = parseEnvFile(fs.readFileSync(piEnv, "utf8"));
			if (map[envVar]) return map[envVar]!;
		} catch {}
	}
	return null;
}

/** Write/update an API key in local .env and process.env. */
export function writeEnvKey(cwd: string, envVar: string, value: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envVar)) throw new Error(`Invalid environment variable name: ${envVar}`);
	if (/[\r\n]/.test(value)) throw new Error("API key must be a single line");
	const localEnv = path.join(cwd, ".env");
	let content = "";
	if (fs.existsSync(localEnv)) {
		try {
			content = fs.readFileSync(localEnv, "utf8");
		} catch {}
	}

	const lines = content ? content.split(/\r?\n/) : [];
	let found = false;
	const newLines = lines.map((l) => {
		const trimmed = l.trim();
		if (!trimmed.startsWith("#") && trimmed.includes("=")) {
			const k = trimmed.slice(0, trimmed.indexOf("=")).trim();
			if (k === envVar) {
				found = true;
				return `${envVar}=${value}`;
			}
		}
		return l;
	});

	if (!found) {
		if (newLines.length > 0 && newLines[newLines.length - 1]!.trim().length > 0) {
			newLines.push("");
		}
		newLines.push(`${envVar}=${value}`);
	}

	atomicWriteFile(localEnv, newLines.join("\n").trim() + "\n", 0o600);
	process.env[envVar] = value;
}

function atomicWriteFile(filePath: string, content: string, mode?: number): void {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
	try {
		fs.writeFileSync(tempPath, content, { encoding: "utf8", mode });
		fs.renameSync(tempPath, filePath);
	} catch (err) {
		try {
			fs.unlinkSync(tempPath);
		} catch {}
		throw err;
	}
}

/** Format an API key status preview for dialog display. */
export function maskApiKey(key: string | null): string {
	if (!key || !key.trim()) return "Not Set";
	const trimmed = key.trim();
	if (trimmed.length <= 8) return "Set (***)";
	return `...${trimmed.slice(-4)}`;
}

export interface CustomModelEntry {
	id: string;
	name?: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
}

export function getModelsJsonPath(): string {
	const configDir = process.env.PI_CONFIG_DIR ?? path.join(os.homedir(), ".pi", "agent");
	return path.join(configDir, "models.json");
}

export function readCustomModelsConfig(): Record<string, { models?: CustomModelEntry[] }> {
	const filePath = getModelsJsonPath();
	if (!fs.existsSync(filePath)) return {};
	try {
		const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
		if (data && typeof data === "object" && data.providers && typeof data.providers === "object") {
			return data.providers;
		}
		if (data && typeof data === "object") {
			return data;
		}
	} catch {}
	return {};
}

export const PROVIDER_DEFAULTS: Record<string, { baseUrl?: string; api: string; envVar: string }> = {
	openrouter: { baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions", envVar: "OPENROUTER_API_KEY" },
	opencode: { baseUrl: "https://api.opencode.ai/v1", api: "openai-completions", envVar: "OPENCODE_API_KEY" },
	deepseek: { baseUrl: "https://api.deepseek.com/v1", api: "openai-completions", envVar: "DEEPSEEK_API_KEY" },
	google: { api: "google-generative-ai", envVar: "GEMINI_API_KEY" },
	anthropic: { api: "anthropic-messages", envVar: "ANTHROPIC_API_KEY" },
	openai: { baseUrl: "https://api.openai.com/v1", api: "openai-completions", envVar: "OPENAI_API_KEY" },
	groq: { baseUrl: "https://api.groq.com/openai/v1", api: "openai-completions", envVar: "GROQ_API_KEY" },
	mistral: { baseUrl: "https://api.mistral.ai/v1", api: "openai-completions", envVar: "MISTRAL_API_KEY" },
	xai: { baseUrl: "https://api.x.ai/v1", api: "openai-completions", envVar: "XAI_API_KEY" },
	together: { baseUrl: "https://api.together.xyz/v1", api: "openai-completions", envVar: "TOGETHER_API_KEY" },
};

export function saveCustomModel(
	providerId: string,
	model: CustomModelEntry,
	options?: { baseUrl?: string; api?: string; apiKey?: string },
): void {
	const filePath = getModelsJsonPath();
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

	let fullData: { providers?: Record<string, { baseUrl?: string; api?: string; apiKey?: string; models?: CustomModelEntry[] }> } = {};
	if (fs.existsSync(filePath)) {
		try {
			fullData = JSON.parse(fs.readFileSync(filePath, "utf8"));
		} catch (err: unknown) {
			throw new Error(`Cannot update malformed models.json: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	if (!fullData.providers) fullData.providers = {};
	const p = providerId.toLowerCase().trim();
	if (!fullData.providers[p]) {
		fullData.providers[p] = { models: [] };
	}

	const def = PROVIDER_DEFAULTS[p];
	if (options?.baseUrl) {
		fullData.providers[p]!.baseUrl = options.baseUrl;
	} else if (def?.baseUrl && !fullData.providers[p]!.baseUrl) {
		fullData.providers[p]!.baseUrl = def.baseUrl;
	}

	if (options?.api) {
		fullData.providers[p]!.api = options.api;
	} else if (def?.api && !fullData.providers[p]!.api) {
		fullData.providers[p]!.api = def.api;
	}

	if (options?.apiKey) {
		fullData.providers[p]!.apiKey = options.apiKey;
	} else if (def?.envVar && !fullData.providers[p]!.apiKey) {
		fullData.providers[p]!.apiKey = `$${def.envVar}`;
	}

	if (!Array.isArray(fullData.providers[p]!.models)) {
		fullData.providers[p]!.models = [];
	}

	// Deduplicate by model id
	const existing = fullData.providers[p]!.models!.filter((m) => m.id.toLowerCase() !== model.id.toLowerCase());
	existing.push(model);
	fullData.providers[p]!.models = existing;

	atomicWriteFile(filePath, JSON.stringify(fullData, null, 2) + "\n", 0o600);
}

export function setCustomModelReasoning(providerId: string, modelId: string, reasoning: boolean): void {
	const filePath = getModelsJsonPath();
	if (!fs.existsSync(filePath)) {
		saveCustomModel(providerId, { id: modelId, name: modelId, reasoning });
		return;
	}
	try {
		const fullData = JSON.parse(fs.readFileSync(filePath, "utf8"));
		const p = providerId.toLowerCase().trim();
		if (fullData.providers && fullData.providers[p] && Array.isArray(fullData.providers[p].models)) {
			const m = fullData.providers[p].models.find((item: CustomModelEntry) => item.id.toLowerCase() === modelId.toLowerCase());
			if (m) {
				m.reasoning = reasoning;
				atomicWriteFile(filePath, JSON.stringify(fullData, null, 2) + "\n", 0o600);
				return;
			}
		}
		saveCustomModel(providerId, { id: modelId, name: modelId, reasoning });
	} catch {
		saveCustomModel(providerId, { id: modelId, name: modelId, reasoning });
	}
}

export interface SessionSummary {
	id: string;
	title: string;
	firstPrompt: string;
	model?: string;
	date: string;
	path: string;
	mtime: number;
	kind: "pi" | "transcript";
}

function normalizePathForComparison(value: string): string {
	const resolved = path.resolve(value);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function summarizePiSession(filePath: string, projectCwd: string): Promise<SessionSummary | null> {
	let stat: fs.Stats;
	try {
		stat = await fs.promises.stat(filePath);
	} catch {
		return null;
	}
	let sessionCwd = "";
	let firstPrompt = "(no prompt)";
	let modelName: string | undefined;
	let customName: string | undefined;
	try {
		const lines = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
		for await (const line of lines) {
			if (!line.trim()) continue;
			try {
				const obj = JSON.parse(line) as Record<string, any>;
				if (obj.type === "session") {
					if (obj.cwd) sessionCwd = String(obj.cwd);
					if (obj.sessionName) customName = String(obj.sessionName);
				} else if (obj.type === "set_session_name" && obj.name) {
					customName = String(obj.name);
				} else if (obj.type === "model_change" && obj.modelId) {
					modelName = obj.provider ? `${obj.provider}/${obj.modelId}` : String(obj.modelId);
				} else if (obj.type === "message" && obj.message?.role === "user" && firstPrompt === "(no prompt)") {
					const textPart = Array.isArray(obj.message.content)
						? obj.message.content.find((c: any) => c.type === "text")?.text
						: typeof obj.message.content === "string" ? obj.message.content : "";
					if (textPart) {
						let clean = String(textPart).replace(/\[PLAN MODE:[^\]]+\]\s*/i, "").trim();
						if (clean.length > 50) clean = clean.slice(0, 49) + "…";
						firstPrompt = clean || "(empty prompt)";
					}
				} else if (obj.type === "message" && obj.message?.role === "assistant" && !modelName && obj.model) {
					modelName = obj.provider ? `${obj.provider}/${obj.model}` : String(obj.model);
				}
			} catch {}
		}
	} catch {
		return null;
	}
	if (!sessionCwd || normalizePathForComparison(sessionCwd) !== normalizePathForComparison(projectCwd)) return null;
	const file = path.basename(filePath);
	return {
		id: file,
		title: customName || file.replace(/\.jsonl$/i, "").slice(0, 24),
		firstPrompt,
		model: modelName,
		date: stat.mtime.toISOString().slice(0, 16).replace("T", " "),
		path: filePath,
		mtime: stat.mtimeMs,
		kind: "pi",
	};
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		for (;;) {
			const index = next++;
			if (index >= items.length) return;
			results[index] = await fn(items[index]!);
		}
	});
	await Promise.all(workers);
	return results;
}

export async function getProjectSessions(projectCwd: string): Promise<SessionSummary[]> {
	const results: SessionSummary[] = [];
	const configDir = process.env.PI_CONFIG_DIR ?? path.join(os.homedir(), ".pi", "agent");
	const sessionsBaseDir = path.join(configDir, "sessions");
	const jsonlPaths: string[] = [];
	try {
		for (const dirent of await fs.promises.readdir(sessionsBaseDir, { withFileTypes: true })) {
			if (!dirent.isDirectory()) continue;
			const fullDir = path.join(sessionsBaseDir, dirent.name);
			try {
				for (const file of await fs.promises.readdir(fullDir)) {
					if (file.endsWith(".jsonl")) jsonlPaths.push(path.join(fullDir, file));
				}
			} catch {}
		}
	} catch {}
	const summaries = await mapConcurrent(jsonlPaths, 8, (filePath) => summarizePiSession(filePath, projectCwd));
	for (const summary of summaries) if (summary) results.push(summary);

	try {
		for (const f of await fs.promises.readdir(projectCwd)) {
			if (!f.endsWith(".md") || !(f.startsWith("NONAME") || f.includes("SESSION") || f.includes("TASK") || f.toLowerCase().includes("session"))) continue;
			const fullPath = path.join(projectCwd, f);
			try {
				const stat = await fs.promises.stat(fullPath);
				if (!stat.isFile()) continue;
				results.push({
					id: f,
					title: f,
					firstPrompt: "Saved Markdown Transcript",
					date: stat.mtime.toISOString().slice(0, 16).replace("T", " "),
					path: fullPath,
					mtime: stat.mtimeMs,
					kind: "transcript",
				});
			} catch {}
		}
	} catch {}

	return results.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Parses a Pi JSONL session file and populates the AgentPanel with historical conversation entries.
 * Returns metadata such as last used model and thinking level.
 */
export interface ParsedSession {
	entries: AgentEntry[];
	model?: string;
	thinkingLevel?: string;
	title?: string;
}

export function parseJsonlSession(filePath: string): ParsedSession {
	if (!fs.existsSync(filePath)) throw new Error(`Session file not found: ${filePath}`);

	let extractedModel: string | undefined = undefined;
	let extractedThinkingLevel: string | undefined = undefined;
	let extractedTitle: string | undefined = undefined;
	const entries: AgentEntry[] = [];

	try {
		const content = fs.readFileSync(filePath, "utf8");
		const lines = content.split("\n");

		for (const line of lines) {
			if (!line.trim()) continue;
			let obj: any;
			try {
				obj = JSON.parse(line);
			} catch {
				continue;
			}

			if (obj.type === "session") {
				if (obj.sessionName) extractedTitle = String(obj.sessionName);
			} else if (obj.type === "set_session_name" && obj.name) {
				extractedTitle = String(obj.name);
			} else if (obj.type === "model_change" && obj.modelId) {
				extractedModel = obj.provider ? `${obj.provider}/${obj.modelId}` : String(obj.modelId);
			} else if (obj.type === "thinking_level_change" && obj.thinkingLevel) {
				extractedThinkingLevel = String(obj.thinkingLevel);
			} else if (obj.type === "message" && obj.message) {
				const role = obj.message.role;
				const msgContent = obj.message.content;

				if (role === "user") {
					let userText = "";
					if (typeof msgContent === "string") {
						userText = msgContent;
					} else if (Array.isArray(msgContent)) {
						userText = msgContent
							.filter((c: any) => c.type === "text" && c.text)
							.map((c: any) => c.text)
							.join("\n");
					}
					if (userText) {
						entries.push({ kind: "user", text: userText });
					}
				} else if (role === "assistant") {
					if (typeof msgContent === "string") {
						entries.push({ kind: "agent", text: msgContent });
					} else if (Array.isArray(msgContent)) {
						for (const part of msgContent) {
							if (part.type === "thinking" && part.thinking) {
								entries.push({ kind: "thinking", text: part.thinking });
							} else if (part.type === "text" && part.text) {
								entries.push({ kind: "agent", text: part.text });
							} else if (part.type === "tool_call" || part.type === "tool_use" || part.name) {
								const tName = part.name ?? part.toolName ?? "tool";
								const summary = toolSummary(tName, part.arguments ?? part.input ?? {});
								entries.push({
									kind: "tool",
									tag: summary.tag,
									text: summary.text,
									toolCallId: part.toolCallId ?? part.id ?? undefined,
								});
							}
						}
					}
				} else if (role === "toolResult") {
					const toolText = Array.isArray(msgContent)
						? msgContent
								.filter((c: any) => c.type === "text" && typeof c.text === "string")
								.map((c: any) => c.text)
								.join("\n")
								.trim()
						: "";
					if (!toolText) continue;
					const isErr = Boolean(obj.message.isError);
					const callId = obj.message.toolCallId;
					let last: any;
					for (let i = entries.length - 1; i >= 0; i--) {
						const e = entries[i];
						if (!e || e.kind !== "tool") continue;
						if (e.toolCallId && e.toolCallId === callId) { last = e; break; }
						if (!last && !e.resultText) last = e;
					}
					if (last) {
						last.resultText = toolText;
						last.isError = isErr;
					} else {
						entries.push({
							kind: "tool",
							text: "",
							tag: isErr ? "[ERROR]" : "[OK]",
							isError: isErr,
							resultText: toolText,
						});
					}
				}
			} else if (obj.type === "tool_execution_start") {
				const summary = toolSummary(obj.toolName ?? "tool", obj.args);
				let last: any;
				// A session may contain both the assistant tool_call part and the
				// execution record for the same call; keep a single row per call.
				// Match by id first, else the most recent unclaimed row with the
				// same summary (ordered pairing for id-less assistant parts).
				for (let i = entries.length - 1; i >= 0; i--) {
					const e = entries[i];
					if (!e || e.kind !== "tool") continue;
					if (e.toolCallId && e.toolCallId === obj.toolCallId) { last = e; break; }
					if (!last && !e.toolCallId && !e.resultText && e.tag === summary.tag && e.text === summary.text) last = e;
				}
				if (last) {
					last.toolCallId = last.toolCallId ?? obj.toolCallId;
				} else {
					entries.push({ kind: "tool", tag: summary.tag, text: summary.text, toolCallId: obj.toolCallId });
				}
			}
		}
	} catch (err: unknown) {
		throw new Error(`Error loading session: ${err instanceof Error ? err.message : String(err)}`);
	}

	return { entries, model: extractedModel, thinkingLevel: extractedThinkingLevel, title: extractedTitle };
}
