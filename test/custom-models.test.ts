import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { saveCustomModel, readCustomModelsConfig, getModelsJsonPath } from "../src/commands/commands.js";
import { AddModelDialog } from "../src/ui/add-model-dialog.js";
import { ModelSelector } from "../src/ui/model-selector.js";
import { MAIN_MENUS } from "../src/ui/menu-bar.js";

test("saveCustomModel and readCustomModelsConfig write and read custom models", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-models-test-"));
	const originalConfigDir = process.env.PI_CONFIG_DIR;
	process.env.PI_CONFIG_DIR = tmpDir;

	try {
		// Initially empty
		const initial = readCustomModelsConfig();
		assert.deepEqual(initial, {});

		// Save a model
		saveCustomModel("openrouter", {
			id: "anthropic/claude-3.7-sonnet",
			name: "Claude 3.7 Sonnet (OpenRouter)",
			reasoning: true,
		});

		const after1 = readCustomModelsConfig();
		assert.ok(after1.openrouter);
		assert.equal(after1.openrouter.models?.length, 1);
		assert.equal(after1.openrouter.models[0]?.id, "anthropic/claude-3.7-sonnet");
		assert.equal(after1.openrouter.models[0]?.reasoning, true);

		// Save another model for same provider
		saveCustomModel("openrouter", {
			id: "deepseek/deepseek-r1:free",
			name: "DeepSeek R1 Free",
			reasoning: true,
		});

		const after2 = readCustomModelsConfig();
		assert.equal(after2.openrouter?.models?.length, 2);

		// Overwriting existing model id updates it rather than duplicating
		saveCustomModel("openrouter", {
			id: "deepseek/deepseek-r1:free",
			name: "DeepSeek R1 Free (Updated)",
			reasoning: false,
		});

		const after3 = readCustomModelsConfig();
		assert.equal(after3.openrouter?.models?.length, 2);
		const updated = after3.openrouter?.models?.find((m) => m.id === "deepseek/deepseek-r1:free");
		assert.equal(updated?.name, "DeepSeek R1 Free (Updated)");
		assert.equal(updated?.reasoning, false);
	} finally {
		if (originalConfigDir !== undefined) {
			process.env.PI_CONFIG_DIR = originalConfigDir;
		} else {
			delete process.env.PI_CONFIG_DIR;
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("saveCustomModel does not overwrite malformed models.json", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-ai-models-invalid-"));
	const originalConfigDir = process.env.PI_CONFIG_DIR;
	process.env.PI_CONFIG_DIR = tmpDir;
	try {
		const filePath = getModelsJsonPath();
		fs.writeFileSync(filePath, "{ malformed", "utf8");
		assert.throws(() => saveCustomModel("openrouter", { id: "test-model" }), /malformed models\.json/);
		assert.equal(fs.readFileSync(filePath, "utf8"), "{ malformed");
	} finally {
		if (originalConfigDir === undefined) delete process.env.PI_CONFIG_DIR;
		else process.env.PI_CONFIG_DIR = originalConfigDir;
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("AddModelDialog supports field navigation, editing and submit", () => {
	const dialog = new AddModelDialog(80, 24, "openrouter");
	assert.equal(dialog.currentProvider, "openrouter");
	assert.equal(dialog.fieldIndex, 0);

	// Cycle provider
	dialog.cycleProvider(1);
	assert.equal(dialog.currentProvider, "opencode");

	// Move to modelId
	dialog.nextField();
	assert.equal(dialog.fieldIndex, 1);
	dialog.insert("mimo-v2.5-free");
	assert.equal(dialog.modelId, "mimo-v2.5-free");

	dialog.backspace();
	assert.equal(dialog.modelId, "mimo-v2.5-fre");

	// Move to displayName
	dialog.nextField();
	assert.equal(dialog.fieldIndex, 2);
	dialog.insert("MiMo V2.5 Free");
	assert.equal(dialog.displayName, "MiMo V2.5 Free");

	// Move to reasoning (default true)
	dialog.nextField();
	assert.equal(dialog.fieldIndex, 3);
	assert.equal(dialog.reasoning, true);
	dialog.toggleReasoning();
	assert.equal(dialog.reasoning, false);
	dialog.toggleReasoning();
	assert.equal(dialog.reasoning, true);

	// Submit
	const res = dialog.submit();
	assert.ok(res);
	assert.equal(res.provider, "opencode");
	assert.equal(res.modelId, "mimo-v2.5-fre");
	assert.equal(res.name, "MiMo V2.5 Free");
	assert.equal(res.reasoning, true);
});

test("ModelSelector prepends __custom__ option at index 0", () => {
	const selector = new ModelSelector(80, 24);
	selector.setModels([
		{ id: "gpt-4o", name: "GPT-4o", provider: "openai", api: "openai" },
		{ id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic", api: "anthropic" },
	]);

	assert.equal(selector.models.length, 3);
	assert.equal(selector.models[0]?.id, "__custom__");
	assert.equal(selector.models[0]?.provider, "CUSTOM");
	assert.equal(selector.models[1]?.id, "gpt-4o");
	assert.equal(selector.models[2]?.id, "claude-3-5-sonnet");
});

test("Options menu contains Add custom model and Reload models items", () => {
	const optMenu = MAIN_MENUS.find((m) => m.title === "Options");
	assert.ok(optMenu);
	const addModelItem = optMenu.items.find((it) => it.action === "opt.addModel");
	assert.ok(addModelItem);
	assert.equal(addModelItem.mnemonic, "M");

	const reloadItem = optMenu.items.find((it) => it.action === "opt.reloadModels");
	assert.ok(reloadItem);
	assert.equal(reloadItem.mnemonic, "L");
});
