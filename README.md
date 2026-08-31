# TURBO-AI 1.0.2 Beta

[![Version](https://img.shields.io/badge/version-1.0.2%20Beta-blue.svg)](https://github.com/kvv256512-ux/turbo-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

**Turbo-AI** is an authentic Turbo Pascal 7.0 / Borland DOS inspired Terminal UI (TUI) frontend for the **[Pi coding agent](https://github.com/earendil-works/pi-mono)**. It spawns Pi in RPC mode (`pi --mode rpc`) and drives it over its JSONL protocol, delivering an authentic early-1990s Borland IDE development experience with full mouse, hotkey, and multi-window support.

> *A loving homage to Turbo Pascal 7.1. Not affiliated with Borland International.*

```text
 ≡ File  Edit  Search  Run  Compile  Debug  Tools  Options  Window  Help ≡
╔═[■]══════ FILES ══════[▲]═╦═[■]═════════════════ AGENT.PAS ════════════════ 1 ═[▲]═╗
║ ▼ src                     ║ User: Implement session resume & slash commands        ║
║   commands/               ║                                                        ║
║     commands.ts           ║ Thinking: Analyzing project session storage...         ║
║   ui/                     ║                                                        ║
║     session-selector.ts   ║ [SEARCH ] ~/.pi/agent/sessions/                        ║
║     agent-panel.ts        ║ [EDIT   ] src/commands/commands.ts                     ║
║     menu-bar.ts           ║ [EDIT   ] src/main.ts                                  ║
║   main.ts                 ║ [TEST   ] npm test (59 tests passed)                   ║
║   package.json            ║                                                        ║
║                           ╠═[■]══ opencode/x-preview-f-free [high] [BUILD] ◄ 2 ═[▲]╣
║                           ║ > /resume                                              ║
╚═ 1/24 ══════════════════▲═╩═ 1:1 ════════════════════════════════════════════════▲═╝
 F1 Help  F2 Save  F3 Open  F4 Model  F5 Effort  F6 Mode  F7 Diff  F8 Test  F9 Build  F10 Menu
```
<p align="center">
  <img src="assets/screenshot-menu.png" width="49%" alt="Turbo-AI Main Interface & Menu" />
  <img src="assets/screenshot-about.png" width="49%" alt="Turbo-AI About Dialog & Thinking" />
</p>

---

## 🚀 Key Features

### 🏛️ Authentic Turbo Pascal 7.0 / Turbo Vision GUI
- **16-Color DOS/VGA Palette**: Classic Borland royal blue desktop, double-line frames, and 3D shadow buttons.
- **Top Menu Bar (10 Menus)**: `File`, `Edit`, `Search`, `Run`, `Compile`, `Debug`, `Tools`, `Options`, `Window`, `Help` with red mnemonic shortcuts (`Alt+F`..`Alt+H`).
- **Interactive Session Selector (`SessionSelector`)**: Browse and resume project sessions with date/time, task previews, and `1`..`9` fast shortcuts (`F3 Open`, `/resume`, `/sessions`).
- **Recent Sessions History**: The `File` menu automatically lists up to 9 recently saved/opened sessions with red numbered shortcuts (`1.` .. `9.`).
- **Complete Mouse Interaction**: Click to focus windows, open menus, select tree files, click window close `[■]` and zoom `[▲]` boxes, scroll lists with mouse wheel, and drag to select & copy text.

### 🧠 Advanced LLM & Reasoning Workflow
- **Model Switching (`F4 Model`)**: Browse all available models from Pi, or use `[+] Enter custom model ID...` for quick custom models.
- **Custom Model Management**: Add and configure arbitrary models across providers (`openrouter`, `opencode`, `deepseek`, `google`, `anthropic`, `openai`, `groq`, `mistral`, `xai`, `together`) directly from `Options` → `Add custom model...` with automatic `%USERPROFILE%\.pi\agent\models.json` synchronization.
- **API Key Configuration (`Options` → `Configure API keys...`)**: Intuitive dialog to configure and securely save provider API keys to local `.env`.
- **Reasoning Effort Control (`F5 Effort`)**: Dedicated hotkey and status toggle cycling through reasoning effort levels (`low` → `medium` → `high` → `off`), with automatic model reasoning flag enablement.
- **PLAN / BUILD Modes (`F6 Mode`)**: Switch seamlessly between Architectural Planning mode (`[PLAN]`) and Autonomous Code Execution mode (`[BUILD]`).
- **Visual Thinking Distinction**: Model reasoning (`thinking_delta`) is rendered in subtle **Gray** (`LIGHTGRAY`), while the final response is rendered in crisp **Bright White** (`WHITE`) with syntax highlighting.
- **Built-in Slash Commands**: Process `/status`, `/help`, `/compact`, `/clear`, `/model`, `/effort`, `/plan`, `/build`, `/diff`, `/test`, `/save`, `/open`, and `/resume` directly from the prompt input.

### 📁 Codebase Navigation & Git Tools
- **Project Tree Window**: Live filesystem explorer with folder expand/collapse, git-dirty indicators, and instant file preview (`Click` / Enter).
- **Unified Diff Viewer (`F7 Diff`)**: Color-coded side-by-side / unified diff viewer for git changes.
- **Test & Build Integration**: Direct execution of `npm test` (`F8 Test`) and `npm run build` (`F9 Build`) through Pi RPC.

---

## ⌨️ Keyboard & Mouse Shortcuts

| Key | Description |
|---|---|
| **`F1`** | Open Help screen & shortcut reference |
| **`F2`** | Save current session to file (`.md`) |
| **`F3`** | Open Interactive Session Selector / Browse Sessions |
| **`F4`** | Select AI Model (from Pi or custom) |
| **`F5`** | Cycle Reasoning / Thinking Effort (`low` → `medium` → `high` → `off`) |
| **`F6`** | Toggle **PLAN** / **BUILD** mode |
| **`F7`** | View Unified Git Diff |
| **`F8`** | Run Tests (`npm test` via Pi) |
| **`F9`** | Run Build (`npm run build` via Pi) |
| **`F10`** | Toggle Top Menu Bar |
| **`Alt+F..H`** | Direct menu hotkeys (`Alt+F` File, `Alt+O` Options, etc.) |
| **`Ctrl+F`** | Filter project tree |
| **`Ctrl+L`** | Clear agent message history |
| **`Ctrl+C`** | Copy selected text to system clipboard / abort command |
| **`Alt+X`** | Exit Turbo-AI to terminal |
| **`Tab`** | Cycle active window focus |
| **`Esc`** | Close dialog / dismiss menu / cancel |

---

## 📦 Requirements

- **Node.js** >= 20
- **Windows 10/11**, Linux, or macOS
- **Terminal**: Modern terminal with ANSI/VT and 16-color support (e.g. *Windows Terminal*, VS Code terminal, iTerm2, Alacritty).
- **Pi coding agent**: Installed and available on PATH (`pi --version`). Tested with `@earendil-works/pi-coding-agent` >= 0.78.0.

---

## 🛠️ Installation & Setup

```bash
# Clone the repository
git clone https://github.com/kvv256512-ux/turbo-ai.git
cd turbo-ai

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Start compiled version
npm start
```

### Running from any folder (global command):

Register the global `turbo-ai` launcher once, then start it from any project directory — it always targets the folder you are in:

```bash
# One-time (from the repository folder)
npm link

# Then, from any project:
cd ~/my-project
turbo-ai
```

An alternative one-time install is `npm install -g .` from the repository folder. The launcher runs the compiled `dist/` build, and the `prepare` script rebuilds it automatically during linking/installing.

### Running in a specific directory:
```bash
turbo-ai --dir C:/path/to/project
npm start -- --dir C:/path/to/project
```

Changing the directory from the File menu reconnects Pi in the selected project and starts a new backend session. If the new connection fails, the current project and session stay active.

### Running unit tests:
```bash
npm test
```

### Running all checks:
```bash
npm run check
```

---

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────────┐
│                   TURBO-AI                       │
│  10-Menu Bar │ Project Tree │ Agent Panel (DOS)  │
│  Double-buffered ANSI cell screen (DOS Palette)  │
└─────────────────────────┬────────────────────────┘
                          │ JSONL over stdio (pi --mode rpc --no-session)
                          ▼
┌──────────────────────────────────────────────────┐
│                      PI                          │
│  LLM orchestration │ RPC engine │ Git & Context  │
└──────────────────────────────────────────────────┘
```

- **Pure Frontend Architecture**: Pi is never modified or forked; Turbo-AI drives Pi strictly via the documented JSONL RPC protocol.
- **Zero Runtime Dependencies**: The UI engine is a double-buffered character cell grid written directly in TypeScript with ANSI escape codes.

---

## 📄 License

MIT © 2026 Turbo-AI Contributors.
Homage to Turbo Pascal © 1983-1997 Borland International, Inc.
