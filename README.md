# ◈ Bot Yar

A local AI coding agent for Windows — powered by your own OpenRouter key. No accounts, no subscriptions, everything stays on your machine.

**بوت يار** — وكيل برمجة محلي يعمل بمفتاح OpenRouter الخاص بك. بدون حسابات وبدون اشتراكات، وكل شيء يبقى على جهازك.

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

### Agent tools
| Tool | What it does |
|---|---|
| `Read` | Reads files with numbered lines + ranges. **Reads images too (vision)** |
| `Edit` | Writes files with **colored diff preview + approval gate** |
| `LS` / `Glob` / `Grep` | Explore the project (regex content search, glob patterns) |
| `Shell` | Runs PowerShell in the project folder (120s timeout) |
| `WebSearch` / `WebFetch` | Live web search + URL fetching (HTML → markdown) |
| `update_todos` | Live task checklist |
| `ask_user` | Agent pauses and asks you with clickable options |

### Slash commands / Skills
- Built-in: `/review` `/goal` `/test` `/commit` `/explain`
- Add your own: drop a `.md` file into `<project>/.botyar/skills/`
- Type `/` in the composer for the autocomplete menu
- **Skills dashboard** tab in the sidebar: browse all commands with descriptions

### Sessions & parallel agents
- Every conversation is **persisted to disk** automatically
- Run **multiple agents in parallel** — each session is an independent agent
- Project file tree + live todo list in the sidebar

### MCP server support
- Connect any [Model Context Protocol](https://modelcontextprotocol.io) server
- Tools discovered at runtime and passed to the agent automatically
- Manage servers in **Settings → 🔌 MCP** tab

### Docker sandbox
- View running containers, pull images, run commands in containers
- Manage in **Settings → 🐳 Docker** tab

### Token usage tracking
- Live `↑ prompt · ↓ completion · total` counter in the chat header
- Persisted per session so you can track costs across runs

### Bilingual
- English & Arabic with full **RTL support**
- Every message auto-detects its text direction

### Keyboard shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+N` | New chat session |
| `Ctrl+,` | Open settings |
| `Enter` | Send message |
| `Shift+Enter` | Newline in composer |
| `/name Tab` | Insert slash command |

### Real design system
- UI built on the `sand-*` design tokens and `TranscriptCardFrame` recovered from the Grok Bot 0.18.0 renderer

---

## 🚀 Getting started

```powershell
git clone https://github.com/iiiYar/iBot.git
cd iBot
npm install
npm run build
npm start
```

1. Open **⚙ Settings** (`Ctrl+,`) → paste your [OpenRouter API key](https://openrouter.ai/keys) → click ✓ to verify
2. Pick a model (or add any custom `vendor/model` from openrouter.ai/models)
3. **📁 Open project** → choose your code folder
4. Describe a task — Plan mode creates a task list first for your approval

> ⚠️ The `Shell` tool runs real PowerShell commands on your machine with your permissions. Review edits before approving — or enable auto-approve at your own risk.

---

## 🧱 Architecture

```
iBot/
├── electron/                  # Main process: IPC (fs/shell/net/sessions/mcp/docker)
├── src/
│   ├── agent.ts               # Agent loop: OpenRouter streaming + tool calling + vision
│   ├── components/
│   │   ├── Sidebar.tsx        # Sessions / Files / Todos / Skills dashboard
│   │   ├── ChatHeader.tsx     # Model picker + plan mode + MCP badge + token usage
│   │   ├── ChatThread.tsx     # Message thread with auto-scroll
│   │   ├── Composer.tsx       # Textarea + slash menu + image attach
│   │   └── SettingsModal.tsx  # General / MCP / Docker tabs
│   ├── McpSettings.tsx        # MCP server CRUD + connect/disconnect
│   ├── DockerPanel.tsx        # Docker container list + run form
│   ├── TokenUsage.tsx         # Token counter component
│   ├── sand/                  # Design system (TranscriptCardFrame + sand-* tokens)
│   ├── i18n.ts                # EN/AR strings
│   └── App.tsx                # Root: wires all components together
```

- **No backend** — renderer talks to OpenRouter directly; tools run via IPC in the main process
- **Path scoping** — file tools are locked inside the selected project folder
- **Sessions** live in `%APPDATA%/BotYar/sessions/*.json`

---

## 🗓️ Roadmap — Completed Phases

| Phase | What was built |
|---|---|
| 1 | Electron shell + IPC + file tools (Read/Edit/LS/Glob/Grep/Shell) |
| 2 | Workspace persistence (projects + sessions) + bilingual UI |
| 3 | MCP server support (connect / discover tools / call) |
| 4 | Docker panel + agent token tracking |
| 5 | Settings tabs (General / MCP / Docker) + TokenUsage component + i18n |
| 6 | **UI/UX rewrite** — component split + skills dashboard + auto-scroll + keyboard shortcuts |

## License
MIT
