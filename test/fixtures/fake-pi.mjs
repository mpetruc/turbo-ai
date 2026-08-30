let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	buffer += chunk;
	for (;;) {
		const index = buffer.indexOf("\n");
		if (index === -1) break;
		const line = buffer.slice(0, index);
		buffer = buffer.slice(index + 1);
		const command = JSON.parse(line);
		if (command.type === "get_messages") continue;
		if (command.type === "bash" && command.command === "exit-now") {
			process.exit(3);
		}
		if (command.type === "switch_session" && command.sessionPath.includes("fail-session")) {
			process.stdout.write(`${JSON.stringify({ type: "response", command: command.type, success: false, id: command.id, error: "switch rejected" })}\n`);
			continue;
		}
		const data = command.type === "get_state"
			? { model: null, isStreaming: false, isCompacting: false, sessionId: "fake" }
			: {};
		process.stdout.write(`${JSON.stringify({ type: "response", command: command.type, success: true, id: command.id, data })}\n`);
	}
});
