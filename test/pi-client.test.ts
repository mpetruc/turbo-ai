import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PiClient, defaultRpcArgs } from "../src/rpc/pi-client.js";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-pi.mjs");

test("default RPC launch args persist pi sessions", () => {
	const args = defaultRpcArgs();
	assert.ok(args.includes("--mode"), "RPC mode must be enabled by default");
	assert.ok(
		!args.includes("--no-session"),
		"--no-session disables session persistence; sessions must be saved so /save, /open, and /resume work",
	);
});

function createClient(): PiClient {
	return new PiClient({ command: process.execPath, args: [fixture], cwd: process.cwd() });
}

test("PiClient correlates responses and resolves pending requests on dispose", async () => {
	const client = createClient();
	await client.start();
	const state = await client.request<{ sessionId: string }>({ type: "get_state" });
	assert.equal(state.success, true);
	assert.equal(state.data?.sessionId, "fake");

	const pending = client.request({ type: "get_messages" }, 5000);
	client.dispose();
	const disposed = await pending;
	assert.equal(disposed.success, false);
	assert.equal(disposed.error, "PI DISPOSED");
});

test("PiClient emits disconnected once when the child exits", async () => {
	const client = createClient();
	let disconnects = 0;
	client.on("disconnected", () => disconnects++);
	await client.start();
	client.send({ type: "bash", command: "exit-now" });
	await new Promise<void>((resolve) => client.once("disconnected", () => resolve()));
	assert.equal(disconnects, 1);
	client.dispose();
});
