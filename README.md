# ◈ Bot Yar

A local AI coding agent for Windows — powered by your own OpenRouter key. No accounts, no subscriptions, everything stays on your machine.

**بوت يار** — وكيل برمجة محلي يعمل بمفتاح OpenRouter الخاص بك. بدون حسابات وبدون اشتراكات، وكل شيء يبقى على جهازك.

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

### Agent tools (ported from Grok Bot 0.18 reconstruction)
| Tool | What it does |
|---|---|
| `Read` | Reads files with numbered lines + ranges. **Reads images too (vision)** |
| `Edit` | Writes files with **colored diff preview + approval gate** |
| `LS` / `Glob` / `Grep` | Explore the project (regex content search, glob patterns) |
| `Shell` | Runs PowerShell in the project folder (120s timeout) |
| `WebSearch` / `WebFetch` | Live web search + URL fetching (HTML → markdown) |
| `update_todos` | Live task checklist (same schema as the original) |
| `ask_user` | Agent pauses and asks you with clickable options |

### Slash commands / Skills
- Built-in: `/review` `/goal` `/test` `/commit` `/explain`
- Add your own: drop a `.md` file into `<project>/.botyar/skills/` (frontmatter: `name`, `description`)
- Type `/` in the composer for the autocomplete menu

### Sessions & parallel agents
- Every conversation is **persisted to disk** automatically — close and reopen anytime
- Run **multiple agents in parallel**: each session is an independent agent with its own project and task
- Project tree + live todo list in the sidebar

### Bilingual
- English & Arabic with full **RTL support** — every message auto-detects its direction

### Real design system
- UI built on the `sand-*` design tokens and `TranscriptCardFrame` recovered from the Grok Bot 0.18.0 renderer

---

## 🚀 Getting started

```powershell
git clone https://github.com/YOUR_USERNAME/bot-yar.git
cd bot-yar
npm install
npm run build
npm start
```

1. Open **⚙ Settings** → paste your [OpenRouter API key](https://openrouter.ai/keys) → click ✓ to verify
2. Pick a model (or add any custom `vendor/model` from openrouter.ai/models)
3. **📁 Open project** → choose your code folder
4. Describe a task — Plan mode creates a task list first for your approval

> ⚠️ The `Shell` tool runs real PowerShell commands on your machine with your permissions. Review edits before approving — or enable auto-approve at your own risk.

---

## 🧱 How it's built

```
bot-yar/
├── electron/          # Main process: window, IPC (fs/shell/net/sessions/skills)
├── src/
│   ├── agent.ts       # Agent loop: OpenRouter streaming + tool calling + vision
│   ├── sand/          # Design system ported from Grok Bot (TranscriptCardFrame + sand-* tokens)
│   ├── i18n.ts        # EN/AR strings
│   └── App.tsx        # UI: sessions, chat, skills menu, diffs
```

- **No backend** — the renderer talks to OpenRouter directly; tools run via IPC in the main process
- **Path scoping** — file tools are locked inside the selected project folder
- **Sessions** live in `%APPDATA%/BotYar/sessions/*.json`

Design system and tool semantics are ported from the open-source [grok-bot-0.18-reconstructed](https://github.com/b-nnett/grok-bot-0.18-reconstructed) project.

## 🗺️ Roadmap
- [ ] Task subagents (parallel sub-tasks inside one agent)
- [ ] MCP server support
- [ ] Docker sandbox execution
- [ ] Conversation search & export

## License
MIT
