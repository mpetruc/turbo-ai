import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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

/** Collect real git information for the status bar / Git menu. Null-safe when not a repo. */
export async function collectGitInfo(cwd: string): Promise<GitInfo> {
	const empty: GitInfo = { branch: null, added: null, removed: null, dirtyFiles: [], isRepo: false };
	try {
		const status = await exec("git", ["status", "--porcelain", "-b"], cwd);
		const lines = status.split("\n").filter((l) => l.length > 0);
		let branch: string | null = null;
		const dirtyFiles: string[] = [];
		for (const line of lines) {
			if (line.startsWith("##")) {
				const m = /## ([^\s.]+)/.exec(line);
				branch = m?.[1] ?? null;
			} else {
				dirtyFiles.push(line.slice(3));
			}
		}
		let added: number | null = null;
		let removed: number | null = null;
		try {
			const numstat = await exec("git", ["diff", "--numstat"], cwd);
			added = 0;
			removed = 0;
			for (const l of numstat.split("\n")) {
				const [a, r] = l.split("\t");
				if (a && /^\d+$/.test(a)) added += parseInt(a, 10);
				if (r && /^\d+$/.test(r)) removed += parseInt(r, 10);
			}
			if (dirtyFiles.length === 0 && added === 0 && removed === 0) {
				added = null;
				removed = null;
			}
		} catch {
			added = null;
			removed = null;
		}
		return { branch, added, removed, dirtyFiles, isRepo: true };
	} catch {
		return empty;
	}
}

export async function gitDiff(cwd: string): Promise<string> {
	return await exec("git", ["diff", "-U2"], cwd);
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

	fs.writeFileSync(localEnv, newLines.join("\n").trim() + "\n", "utf8");
	process.env[envVar] = value;
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
		} catch {}
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

	fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2) + "\n", "utf8");
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
				fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2) + "\n", "utf8");
				return;
			}
		}
		saveCustomModel(providerId, { id: modelId, name: modelId, reasoning });
	} catch {
		saveCustomModel(providerId, { id: modelId, name: modelId, reasoning });
	}
}
