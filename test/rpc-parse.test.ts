import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRpcLine } from "../src/rpc/types.js";

test("parseRpcLine parses responses", () => {
	const r = parseRpcLine('{"type":"response","command":"prompt","success":true,"id":"req-1"}');
	assert.ok(r);
	assert.equal(r.type, "response");
	if (r.type === "response") {
		assert.equal(r.success, true);
		assert.equal(r.id, "req-1");
	}
});

test("parseRpcLine parses events", () => {
	const r = parseRpcLine('{"type":"agent_start"}');
	assert.ok(r);
	assert.equal(r.type, "agent_start");
});

test("parseRpcLine parses message_update with nested delta", () => {
	const line = JSON.stringify({
		type: "message_update",
		message: { role: "assistant", content: [] },
		assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hi" },
	});
	const r = parseRpcLine(line);
	assert.ok(r);
	assert.equal(r.type, "message_update");
});

test("parseRpcLine keeps Unicode line separators inside strings intact", () => {
	const msg = "a\u2028b\u2029c";
	const r = parseRpcLine(JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: msg } }));
	assert.ok(r);
	if (r.type === "message_update") {
		assert.equal((r.assistantMessageEvent as { delta: string }).delta, msg);
	}
});

test("parseRpcLine rejects garbage", () => {
	assert.equal(parseRpcLine("not json"), null);
	assert.equal(parseRpcLine(""), null);
	assert.equal(parseRpcLine("[1,2]"), null);
	assert.equal(parseRpcLine("{}"), null);
});

test("parseRpcLine tolerates trailing CR", () => {
	const r = parseRpcLine('{"type":"agent_start"}\r');
	assert.ok(r);
});
