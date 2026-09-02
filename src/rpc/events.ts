import type { RpcEvent, ToolContentBlock } from "./types.js";

export type EntryKind = "user" | "agent" | "tool" | "error" | "info" | "thinking";

export interface AgentEntry {
	kind: EntryKind;
	/** Text of the entry. Streaming entries accumulate into `text`. */
	text: string;
	/** Tool tag like [READ]; only for kind === "tool". */
	tag?: string;
	isError?: boolean;
	/** Execution id of the tool call; lets result updates land on the right row. */
	toolCallId?: string;
	/** Bounded result output attached to a tool entry; rendered as a dimmed excerpt. */
	resultText?: string;
	resultLines?: number;
	/** True while the tool is executing; rendered with the toolPending background. */
	pending?: boolean;
}

/**
 * Map Pi tool names to compact DOS-style tags.
 * Unknown tools get a generic uppercase tag so nothing is silently dropped.
 */
export function toolTag(toolName: string): string {
	const known: Record<string, string> = {
		read: "[READ]",
		edit: "[EDIT]",
		write: "[WRITE]",
		bash: "[BASH]",
		grep: "[SEARCH]",
		glob: "[SEARCH]",
		find: "[SEARCH]",
		list: "[SEARCH]",
		task: "[RUN]",
	};
	return known[toolName.toLowerCase()] ?? `[${toolName.toUpperCase()}]`;
}

/** Short human-readable summary of a tool call from its name + args/result. */
export function toolSummary(
	toolName: string,
	args: Record<string, unknown> | undefined,
	result?: { content?: Array<{ type: string; text?: string }>; details?: unknown } | null,
	isError?: boolean,
): { tag: string; text: string; isError: boolean } {
	const tag = isError ? "[ERROR]" : toolTag(toolName);
	let text = "";
	if (args) {
		for (const key of ["path", "file_path", "filePath", "command", "pattern", "query", "url"]) {
			const v = args[key];
			if (typeof v === "string") {
				text = v;
				break;
			}
		}
	}
	if (isError && result?.content) {
		const errText = result.content
			.filter((c) => c.type === "text")
			.map((c) => c.text ?? "")
			.join(" ")
			.trim();
		if (errText) text = `${text ? text + ": " : ""}${firstLine(errText, 120)}`;
	} else if (!isError && result && toolName.toLowerCase() === "bash") {
		const out = firstLine(
			(result.content ?? [])
				.filter((c) => c.type === "text")
				.map((c) => c.text ?? "")
				.join("\n"),
			80,
		);
		if (out) text = text ? `${text} -> ${out}` : out;
	}
	return { tag, text, isError: Boolean(isError) };
}

export function firstLine(s: string, maxLen: number): string {
	const line = s.split("\n", 1)[0] ?? "";
	return line.length > maxLen ? line.slice(0, maxLen - 1) + "…" : line;
}

/**
 * Convert a raw RPC event into zero or more agent panel entries.
 * Pure function — the panel just appends the results.
 */
export function eventToEntries(event: RpcEvent): {
	entries: AgentEntry[];
	streamDelta?: string;
	thinkingDelta?: string;
	streamReset?: boolean;
	/** A thinking block boundary was signaled (thinking_start): the next thinking_delta opens a NEW thinking block. */
	thinkingBlockStart?: boolean;
	agentStarted?: boolean;
	agentEnded?: boolean;
	error?: string;
	/** Tool result content to attach to the matching tool row; final=true settles a pending row. */
	toolUpdate?: { toolCallId: string; text: string; isError: boolean; final?: boolean };
} {
	switch (event.type) {
		case "agent_start":
			return { entries: [], agentStarted: true };

		case "agent_end":
			return { entries: [], agentEnded: true };

		case "message_update": {
			const e = event.assistantMessageEvent;
			if (!e) return { entries: [] };
			if (e.type === "text_delta" && typeof e.delta === "string") {
				return { entries: [], streamDelta: e.delta };
			}
			if (e.type === "thinking_delta" && typeof e.delta === "string") {
				return { entries: [], thinkingDelta: e.delta };
			}
			if (e.type === "thinking_start") {
				// A thinking block boundary, not a text-stream reset: the next
				// thinking_delta legitimately starts a NEW thinking block (unlike a
				// bare thinking_delta that arrives mid-answer, which is a trailing
				// chunk of the block already being displayed).
				return { entries: [], thinkingBlockStart: true };
			}
			if (e.type === "text_start") {
				return { entries: [], streamReset: true };
			}
			// toolcall_end marks the model's synthesized call; execution events
			// (tool_execution_start/end) are the single source of tool rows, so no
			// entry is created here — emitting one left a stray empty [TOOL] stub.
			if (e.type === "toolcall_end") {
				return { entries: [] };
			}
			if (e.type === "error") {
				const errMsg = e.errorMessage ?? e.reason ?? "Model error";
				return {
					entries: [{ kind: "error", text: errMsg, tag: "[ERROR]", isError: true }],
					error: errMsg,
				};
			}
			return { entries: [] };
		}

		case "message_end": {
			const msg = event.message as any;
			if (msg && (msg.stopReason === "error" || msg.errorMessage || msg.error)) {
				let errText = msg.errorMessage ?? msg.error;
				if (!errText && Array.isArray(msg.content)) {
					const textParts = msg.content
						.filter((c: any) => c.type === "text" && typeof c.text === "string")
						.map((c: any) => c.text);
					if (textParts.length > 0) errText = textParts.join("\n");
				}
				const fullErr = errText ? `${errText}` : "Model generation failed (check API key, rate limits or endpoint)";
				return { entries: [{ kind: "error", text: fullErr, tag: "[ERROR]", isError: true }], error: fullErr };
			}
			return { entries: [] };
		}

		case "extension_error":
			return {
				entries: [{ kind: "error", text: (event as any).error ?? "Extension error", tag: "[ERROR]", isError: true }],
			};

		case "auto_retry_start":
			return {
				entries: [
					{
						kind: "info",
						text: `API retry attempt ${(event as any).attempt ?? 1}/${(event as any).maxAttempts ?? 3}${(event as any).errorMessage ? `: ${(event as any).errorMessage}` : ""}...`,
					},
				],
			};

		case "auto_retry_end":
			if (!(event as any).success && (event as any).finalError) {
				return {
					entries: [{ kind: "error", text: `Retry failed: ${(event as any).finalError}`, tag: "[ERROR]", isError: true }],
					error: (event as any).finalError,
				};
			}
			return { entries: [] };

		case "turn_end":
			return { entries: [], streamReset: true };

		case "tool_execution_start":
			return {
				entries: [
					{
						kind: "tool",
						text: argsSummary(event.args),
						tag: toolTag(event.toolName),
						isError: false,
						toolCallId: event.toolCallId,
						pending: true,
					},
				],
			};

		case "tool_execution_update":
			// partialResult carries the accumulated output so far; clients replace
			// their display with it on every update (rpc.md). The tool is still running.
			{
				const text = toolResultText(event.partialResult ?? null);
				if (!text) return { entries: [] };
				return { entries: [], toolUpdate: { toolCallId: event.toolCallId, text, isError: false, final: false } };
			}

		case "tool_execution_end":
			// The start entry already exists; success attaches the result excerpt,
			// errors produce a completion marker and settle the pending row.
			if (event.isError) {
				const s = toolSummary(event.toolName, event.args, event.result, true);
				return {
					entries: [{ kind: "error", text: s.text || "tool failed", tag: "[ERROR]", isError: true }],
					toolUpdate: { toolCallId: event.toolCallId, text: "", isError: true, final: true },
				};
			}
			{
				// Compute the success summary with the real result so toolSummary's
				// bash first-line branch stays reachable; prefer the full output text.
				const summary = toolSummary(event.toolName, event.args, event.result, false);
				const text = toolResultText(event.result ?? null) || summary.text;
				// Always emit a (possibly empty) final update so the pending row
				// settles even when the tool produced no output at all.
				return { entries: [], toolUpdate: { toolCallId: event.toolCallId, text, isError: false, final: true } };
			}

		case "extension_ui_request":
			if (event.method === "notify") {
				const t = (event.notifyType as string) ?? "info";
				return {
					entries: [
						{
							kind: t === "error" ? "error" : "info",
							text: String(event.message ?? ""),
							tag: t === "error" ? "[ERROR]" : undefined,
							isError: t === "error",
						},
					],
				};
			}
			return { entries: [] };

		case "compaction_end":
			if (event.errorMessage) return { entries: [{ kind: "error", text: `Compaction failed: ${event.errorMessage}`, tag: "[ERROR]", isError: true }] };
			return { entries: [{ kind: "info", text: "Context compacted." }] };

		case "auto_retry_start":
			return {
				entries: [
					{ kind: "info", text: `Retrying (${(event.attempt ?? 0) + 1}/${event.maxAttempts ?? "?"}): ${firstLine(event.errorMessage ?? "", 100)}` },
				],
			};

		case "auto_retry_end":
			if (event.success === false) {
				return { entries: [{ kind: "error", text: `Retry failed: ${firstLine(event.finalError ?? "", 120)}`, tag: "[ERROR]", isError: true }] };
			}
			return { entries: [] };

		default:
			return { entries: [] };
	}
}

function argsSummary(args: Record<string, unknown> | undefined): string {
	if (!args) return "";
	for (const key of ["path", "file_path", "filePath", "command", "pattern", "query", "url"]) {
		const v = args[key];
		if (typeof v === "string") return v;
	}
	return "";
}

/** Join the text blocks of a tool result/partial result, trimmed. Empty when there is no output. */
export function toolResultText(result: { content?: ToolContentBlock[] } | null | undefined): string {
	if (!result?.content) return "";
	return result.content
		.filter((c) => c.type === "text")
		.map((c) => c.text ?? "")
		.join("\n")
		.trim();
}
