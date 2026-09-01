/**
 * Types for Pi's RPC protocol (JSON over stdin/stdout).
 * Derived from docs/rpc.md of @earendil-works/pi-coding-agent 0.78.0.
 */

export interface RpcResponse {
	type: "response";
	command: string;
	success: boolean;
	id?: string;
	error?: string;
	data?: unknown;
}

export interface ModelInfo {
	id: string;
	name: string;
	api: string;
	provider: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
}

export interface SessionStateData {
	model: ModelInfo | null;
	thinkingLevel?: string;
	isStreaming: boolean;
	isCompacting: boolean;
	sessionFile?: string;
	sessionId?: string;
	sessionName?: string;
	messageCount?: number;
	pendingMessageCount?: number;
}

export interface SessionStatsData {
	tokens?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		total?: number;
	};
	cost?: number;
	contextUsage?: {
		tokens: number | null;
		contextWindow: number;
		percent: number | null;
	} | null;
}

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export function parseThinkingLevel(value: string): ThinkingLevel | null {
	const normalized = value.trim().toLowerCase();
	return THINKING_LEVELS.includes(normalized as ThinkingLevel) ? normalized as ThinkingLevel : null;
}

export interface TextContent {
	type: "text";
	text: string;
}

export interface ToolCallContent {
	type: "toolCall";
	id: string;
	name: string;
	arguments?: Record<string, unknown>;
}

/** A text-capable content block produced by tool execution. */
export interface ToolContentBlock {
	type: string;
	text?: string;
}

/** Accumulated partial tool output (tool_execution_update). */
export interface ToolPartialResult {
	content?: ToolContentBlock[];
}

/** Final tool result payload (tool_execution_end). */
export interface ToolExecutionResult {
	content?: ToolContentBlock[];
	details?: unknown;
	usage?: unknown;
}

export type AssistantMessage = {
	role: "assistant";
	content: Array<TextContent | ToolCallContent | { type: "thinking"; thinking: string }>;
	provider?: string;
	model?: string;
	usage?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		totalTokens?: number;
		cost?: { total?: number };
	};
	stopReason?: string;
};

/** Union of every event type Pi emits on stdout in RPC mode (see docs/rpc.md). */
export type RpcEvent =
	| { type: "agent_start" }
	| { type: "agent_end"; messages?: unknown[] }
	| { type: "turn_start" }
	| { type: "turn_end"; message?: AssistantMessage; toolResults?: unknown[] }
	| { type: "message_start"; message: unknown }
	| { type: "message_update"; message: AssistantMessage; assistantMessageEvent: AssistantStreamEvent }
	| { type: "message_end"; message: AssistantMessage }
	| {
			type: "tool_execution_start";
			toolCallId: string;
			toolName: string;
			args?: Record<string, unknown>;
	  }
	| {
			type: "tool_execution_update";
			toolCallId: string;
			toolName: string;
			args?: Record<string, unknown>;
			partialResult?: ToolPartialResult;
	  }
	| {
			type: "tool_execution_end";
			toolCallId: string;
			toolName: string;
			args?: Record<string, unknown>;
			result?: ToolExecutionResult;
			isError?: boolean;
	  }
	| { type: "queue_update"; steering?: string[]; followUp?: string[] }
	| { type: "compaction_start"; reason?: string }
	| {
			type: "compaction_end";
			reason?: string;
			aborted?: boolean;
			willRetry?: boolean;
			errorMessage?: string;
			result?: unknown;
	  }
	| { type: "auto_retry_start"; attempt?: number; maxAttempts?: number; delayMs?: number; errorMessage?: string }
	| { type: "auto_retry_end"; success?: boolean; attempt?: number; finalError?: string }
	| { type: "extension_error"; extensionPath?: string; event?: string; error?: string }
	| { type: "extension_ui_request"; id: string; method: string; [key: string]: unknown };

export type AssistantStreamEvent =
	| { type: "start" }
	| { type: "text_start"; contentIndex: number }
	| { type: "text_delta"; contentIndex: number; delta: string }
	| { type: "text_end"; contentIndex: number; content?: string }
	| { type: "thinking_start"; contentIndex: number }
	| { type: "thinking_delta"; contentIndex: number; delta: string }
	| { type: "thinking_end"; contentIndex: number }
	| { type: "toolcall_start"; contentIndex: number; toolCall?: ToolCallContent }
	| { type: "toolcall_delta"; contentIndex: number; delta?: string }
	| { type: "toolcall_end"; contentIndex: number; toolCall?: ToolCallContent }
	| { type: "done"; reason?: string }
	| { type: "error"; reason?: string; errorMessage?: string };

export type RpcCommand =
	| { type: "prompt"; message: string; streamingBehavior?: "steer" | "followUp"; id?: string }
	| { type: "steer"; message: string; id?: string }
	| { type: "follow_up"; message: string; id?: string }
	| { type: "abort"; id?: string }
	| { type: "new_session"; parentSession?: string; id?: string }
	| { type: "switch_session"; sessionPath: string; id?: string }
	| { type: "set_session_name"; name: string; id?: string }
	| { type: "get_state"; id?: string }
	| { type: "get_messages"; id?: string }
	| { type: "get_last_assistant_text"; id?: string }
	| { type: "get_fork_messages"; id?: string }
	| { type: "fork"; entryId: string; id?: string }
	| { type: "clone"; id?: string }
	| { type: "export_html"; outputPath?: string; id?: string }
	| { type: "set_model"; provider: string; modelId: string; model?: string; id?: string }
	| { type: "cycle_model"; id?: string }
	| { type: "get_available_models"; id?: string }
	| { type: "set_thinking_level"; level: ThinkingLevel; id?: string }
	| { type: "cycle_thinking_level"; id?: string }
	| { type: "compact"; customInstructions?: string; id?: string }
	| { type: "set_auto_compaction"; enabled: boolean; id?: string }
	| { type: "set_auto_retry"; enabled: boolean; id?: string }
	| { type: "abort_retry"; id?: string }
	| { type: "set_steering_mode"; mode: "all" | "one-at-a-time"; id?: string }
	| { type: "set_follow_up_mode"; mode: "all" | "one-at-a-time"; id?: string }
	| { type: "get_session_stats"; id?: string }
	| { type: "bash"; command: string; id?: string }
	| { type: "abort_bash"; id?: string }
	| { type: "get_commands"; id?: string }
	| { type: "extension_ui_response"; id: string; value?: string; confirmed?: boolean; cancelled?: boolean };

/** Parse one JSONL line into a response or event. Returns null for unparseable lines. */
export function parseRpcLine(line: string): RpcResponse | RpcEvent | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const data: unknown = JSON.parse(trimmed);
		if (typeof data !== "object" || data === null) return null;
		const obj = data as Record<string, unknown>;
		if (obj.type === "response") return data as RpcResponse;
		if (typeof obj.type === "string") return data as RpcEvent;
		return null;
	} catch {
		return null;
	}
}
