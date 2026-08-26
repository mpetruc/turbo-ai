import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { parseRpcLine, type RpcCommand, type RpcEvent, type RpcResponse } from "./types.js";

export interface PiClientOptions {
	/** Command used to launch pi. Defaults to "pi" (resolved via PATH). */
	command?: string;
	cwd?: string;
}

/**
 * Subprocess client for Pi RPC mode.
 *
 * Protocol notes (from docs/rpc.md of pi-coding-agent 0.78.0):
 * - JSONL over stdin/stdout, LF-delimited; accept CRLF by stripping trailing \r.
 * - Do NOT use node readline: it also splits on U+2028/U+2029 which may occur
 *   inside JSON strings. Manual buffering below follows the documented framing.
 */
export class PiClient extends EventEmitter {
	private proc: ChildProcess | null = null;
	private buffer = "";
	private nextId = 1;
	private pending = new Map<string, (r: RpcResponse) => void>();
	private exited = false;
	readonly options: PiClientOptions;

	constructor(options: PiClientOptions = {}) {
		super();
		this.options = options;
	}

	get running(): boolean {
		return this.proc !== null && !this.exited && this.proc.exitCode === null;
	}

	start(): Promise<void> {
		const command = this.options.command ?? process.env.PI_CMD ?? "pi";
		const args = ["--mode", "rpc", "--no-session"];
		return new Promise((resolve, reject) => {
			let settled = false;
			let proc: ChildProcess;
			try {
				proc = spawn(command, args, {
					cwd: this.options.cwd ?? process.cwd(),
					stdio: ["pipe", "pipe", "pipe"],
					// On Windows `pi` is a .cmd shim; shell resolves it via PATH.
					shell: process.platform === "win32",
					windowsHide: true,
				});
			} catch (err) {
				reject(new Error("ERROR: Pi coding agent not found."));
				return;
			}
			this.proc = proc;

			proc.on("error", () => {
				if (!settled) {
					settled = true;
					reject(new Error("ERROR: Pi coding agent not found."));
				}
				this.emit("disconnected");
			});

			// Give the process a moment; if it dies immediately report stderr.
			const startupTimer = setTimeout(() => {
				if (!settled) {
					settled = true;
					resolve();
				}
			}, 700);

			proc.once("exit", (code) => {
				this.exited = true;
				clearTimeout(startupTimer);
				for (const [id, cb] of this.pending) {
					cb({ type: "response", command: "exit", success: false, id, error: "PI DISCONNECTED" });
					this.pending.delete(id);
				}
				this.emit("disconnected", code);
				if (!settled) {
					settled = true;
					const stderr = this.stderrText.trim();
					reject(
						new Error(
							stderr
								? `ERROR: Unable to connect to Pi.\n${stderr.split("\n").slice(-5).join("\n")}`
								: "ERROR: Unable to connect to Pi.",
						),
					);
				}
			});

			proc.stdout?.on("data", (chunk: Buffer) => this.onData(chunk.toString("utf8")));
			proc.stderr?.on("data", (chunk: Buffer) => {
				this.stderrText += chunk.toString("utf8");
				if (this.stderrText.length > 16384) this.stderrText = this.stderrText.slice(-8192);
			});
		});
	}

	private stderrText = "";

	private onData(chunk: string): void {
		this.buffer += chunk;
		for (;;) {
			const idx = this.buffer.indexOf("\n");
			if (idx === -1) break;
			let line = this.buffer.slice(0, idx);
			this.buffer = this.buffer.slice(idx + 1);
			if (line.endsWith("\r")) line = line.slice(0, -1);
			this.handleLine(line);
		}
	}

	private handleLine(line: string): void {
		const msg = parseRpcLine(line);
		if (!msg) return;
		if (msg.type === "response") {
			if (msg.id) {
				const cb = this.pending.get(msg.id);
				if (cb) {
					this.pending.delete(msg.id);
					cb(msg);
					return;
				}
			}
			this.emit("response", msg as RpcResponse);
			return;
		}
		this.emit("event", msg as RpcEvent);
	}

	send(cmd: RpcCommand): void {
		if (!this.running) return;
		this.proc?.stdin?.write(`${JSON.stringify(cmd)}\n`);
	}

	/** Send a command and wait for its correlated response. */
	request<T = unknown>(cmd: RpcCommand, timeoutMs = 15000): Promise<RpcResponse & { data?: T }> {
		return new Promise((resolve) => {
			if (!this.running) {
				resolve({ type: "response", command: String(cmd.type), success: false, error: "PI DISCONNECTED" });
				return;
			}
			const id = `tui-${this.nextId++}`;
			const timer = setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					resolve({ type: "response", command: String(cmd.type), success: false, id, error: "timeout" });
				}
			}, timeoutMs);
			this.pending.set(id, (resp) => {
				clearTimeout(timer);
				resolve(resp as RpcResponse & { data?: T });
			});
			this.send({ ...cmd, id } as RpcCommand);
		});
	}

	dispose(): void {
		if (this.proc && !this.exited) {
			try {
				this.proc.kill();
			} catch {
				/* already gone */
			}
			// Windows .cmd shims sometimes leave the child attached; force after grace period.
			const p = this.proc;
			setTimeout(() => {
				try {
					if (p.exitCode === null) p.kill("SIGKILL");
				} catch {
					/* gone */
				}
			}, 2000);
		}
		this.proc = null;
	}
}
