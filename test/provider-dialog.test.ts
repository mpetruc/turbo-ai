import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseEnvFile, readEnvKey, writeEnvKey, maskApiKey } from "../src/commands/commands.js";
import { ProviderDialog, KNOWN_PROVIDERS } from "../src/ui/provider-dialog.js";
import { MAIN_MENUS } from "../src/ui/menu-bar.js";

test("parseEnvFile parses key=value pairs, ignores comments and whitespace", () => {
	const raw = `
# Comment line
OPENROUTER_API_KEY=sk-or-v1-abc12345678
DEEPSEEK_API_KEY="sk-deepseek-xyz"
EMPTY_VAL=
# Another comment
GEMINI_API_KEY='AIzaSyDummyKey'
`;
	const map = parseEnvFile(raw);
	assert.equal(map["OPENROUTER_API_KEY"], "sk-or-v1-abc12345678");
	assert.equal(map["DEEPSEEK_API_KEY"], "sk-deepseek-xyz");
	assert.equal(map["GEMINI_API_KEY"], "AIzaSyDummyKey");
	assert.equal(map["EMPTY_VAL"], "");
	assert.equal(map["NON_EXISTENT"], undefined);
});

test("maskApiKey masks keys correctly", () => {
	assert.equal(maskApiKey(null), "Not Set");
	assert.equal(maskApiKey(""), "Not Set");
	assert.equal(maskApiKey("1234"), "Set (***)");
	assert.equal(maskApiKey("sk-or-v1-1234567890abcdef"), "...cdef");
});

test("readEnvKey and writeEnvKey create and update .env file", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-env-test-"));
	try {
		// Initial read returns null if not set
		const initial = readEnvKey(tmpDir, "TEST_CUSTOM_KEY");
		assert.equal(initial, null);

		// Write key
		writeEnvKey(tmpDir, "TEST_CUSTOM_KEY", "secret-token-1234");
		assert.equal(readEnvKey(tmpDir, "TEST_CUSTOM_KEY"), "secret-token-1234");

		// Update key
		writeEnvKey(tmpDir, "TEST_CUSTOM_KEY", "new-secret-5678");
		assert.equal(readEnvKey(tmpDir, "TEST_CUSTOM_KEY"), "new-secret-5678");

		// Check file content
		const content = fs.readFileSync(path.join(tmpDir, ".env"), "utf8");
		assert.ok(content.includes("TEST_CUSTOM_KEY=new-secret-5678"));
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("writeEnvKey rejects multiline values", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-env-invalid-"));
	try {
		assert.throws(() => writeEnvKey(tmpDir, "SAFE_KEY", "first\nINJECTED=value"), /single line/);
		assert.equal(fs.existsSync(path.join(tmpDir, ".env")), false);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("ProviderDialog lists known providers and supports navigation", () => {
	const dialog = new ProviderDialog(100, 30, process.cwd());
	assert.ok(dialog.providers.length >= 8);
	assert.equal(dialog.index, 0);
	assert.equal(dialog.current()?.id, "openrouter");

	dialog.down();
	assert.equal(dialog.index, 1);
	assert.equal(dialog.current()?.id, "opencode");

	dialog.up();
	assert.equal(dialog.index, 0);

	dialog.end();
	assert.equal(dialog.index, KNOWN_PROVIDERS.length - 1);

	dialog.home();
	assert.equal(dialog.index, 0);

	// Digit jump
	const idx = dialog.findByDigit("3");
	assert.equal(idx, 2);
	assert.equal(dialog.current()?.id, "deepseek");
});

test("Options menu contains Configure API keys with mnemonic K", () => {
	const optMenu = MAIN_MENUS.find((m) => m.title === "Options");
	assert.ok(optMenu);
	const keysItem = optMenu.items.find((it) => it.action === "opt.keys");
	assert.ok(keysItem);
	assert.equal(keysItem.mnemonic, "K");
});
