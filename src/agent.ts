export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TodoItem = { id: string; content: string; status: TodoStatus };

export const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "Read",
      description:
        "Reads a file from the local filesystem within the project folder. Returns numbered lines. Use start_line/end_line for large files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path, e.g. 'src/index.ts'" },
          start_line: { type: "integer", description: "First line to read (1-based, optional)" },
          end_line: { type: "integer", description: "Last line to read (optional)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "LS",
      description: "List files and folders inside a relative path of the project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path. Use '.' for project root." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Glob",
      description: "Find files matching a glob pattern, e.g. 'src/**/*.ts' or '*.json'. Skips node_modules/.git/dist.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern relative to project root" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Grep",
      description:
        "Search file contents with a regular expression across the project. Returns 'path:line: text' matches (max 200).",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regular expression to search for" },
          glob: { type: "string", description: "Optional filename filter, e.g. '*.ts'" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Edit",
      description:
        "Create or overwrite a file with complete content. The user sees a diff and may need to approve. Creates parent folders automatically.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path" },
          content: { type: "string", description: "Full new file content" },
          description: { type: "string", description: "One-line summary of the change" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Shell",
      description:
        "Execute a PowerShell command inside the project folder (build, install, git, tests...). Timeout 120 seconds.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "PowerShell command" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "WebSearch",
      description:
        "Search the web for real-time information about any topic. Returns summarized information from search results and relevant URLs.\n\nUse this tool when you need up-to-date information that might not be available or correct in your training data, or when you need to verify facts.\nThis includes queries about:\n- Libraries, frameworks, and tools whose APIs, best practices, or usage instructions are frequently updated. (\"How do I run Postgres in a container?\")\n- Current events or technology news. (\"Which AI model is best for coding?\")\n- Informational queries similar to what you might Google (\"kubernetes operator for mysql\")",
      parameters: {
        type: "object",
        properties: {
          search_term: {
            type: "string",
            description:
              "The search term to look up on the web. Be specific and include relevant keywords for better results. For technical queries, include version numbers or dates if relevant.",
          },
          explanation: {
            type: "string",
            description: "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
          },
        },
        required: ["search_term"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "WebFetch",
      description: `Fetch content from a specified URL and return its contents in a readable markdown format. Use this tool when you need to retrieve and analyze webpage content.

- The URL must be a fully-formed, valid URL.
- This tool is read-only and will not work for requests intended to have side effects.
- This fetch tries to return live results but may return previously cached content.
- Authentication is not supported, and an error will be returned if the URL requires authentication.
- If the URL is returning a non-200 status code, the tool will not return the content and will instead return an error message.
- This fetch runs from an isolated server. Hosts like localhost or private IPs will not work.
- This tool does not support fetching binary content, e.g. media or PDFs.`,
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch. The content will be converted to a readable markdown format." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_todos",
      description:
        "Replace the full TODO list for the current task. Use to plan multi-step work and track progress: mark items in_progress when starting and completed when done. Provide the COMPLETE list every time.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Unique short id, e.g. '1'" },
                content: { type: "string", description: "The task description" },
                status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
              },
              required: ["id", "content", "status"],
            },
          },
        },
        required: ["todos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user a clarifying question with optional choices. Use when requirements are ambiguous. The agent pauses until the user answers.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question" },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of choices for the user",
          },
        },
        required: ["question"],
      },
    },
  },
];

export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type UserContent = string | Array<{ type: "text"; text: string } | ImagePart>;

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: UserContent }
  | { role: "assistant"; content: string | null; tool_calls?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type SkillInfo = { name: string; description: string; path: string; source: string };

export type ChatConfig = { apiKey: string; model: string };

export type EditProposal = {
  path: string;
  before: string;
  after: string;
  description: string;
};

export type PendingQuestion = { question: string; options: string[] };

export type AgentHooks = {
  onAssistantDelta: (text: string) => void;
  onAssistantMessage: (text: string) => void;
  onToolCall: (name: string, args: string) => void;
  onToolResult: (name: string, args: string, result: string) => void;
  onTodos: (todos: TodoItem[]) => void;
  onEditProposal: (proposal: EditProposal) => void;
  waitForEditApproval: (proposal: EditProposal) => Promise<"approved" | "rejected">;
  askUser: (question: PendingQuestion) => Promise<string>;
  shouldContinue: () => boolean;
};

const MAX_ITERATIONS = 40;

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

/**
 * Ported from Grok Bot agent-skills-section.ts: the agent_skills prompt
 * section lists each skill with its absolute path; the agent fetches full
 * contents with the Read tool and follows the named skill faithfully.
 */
export function buildSkillsSection(skills: SkillInfo[], readToolName = "Read"): string {
  if (skills.length === 0) return "";
  const items = skills
    .map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ""} (path: ${s.path.split(/[\\/]/).join("/")})`)
    .join("\n");
  return [
    "",
    "agent_skills:",
    `Skills the agent can use. Use the ${readToolName} tool with the provided absolute path to fetch full contents.`,
    "When the user names a skill (for example \"/review\"), read the skill file first and follow its instructions faithfully as part of the current task.",
    "The user's instructions take precedence over skill guidance, and an invoked skill takes precedence over autonomous judgment where they do not conflict.",
    items,
  ].join("\n");
}

function systemPrompt(projectRoot: string | null, planMode: boolean, skills: SkillInfo[]): string {
  const folder = projectRoot ?? "(no folder selected yet - ask the user to choose one)";
  const base = [
    "You are Bot Yar, an expert software engineering agent working directly on the user's machine.",
    `Project folder: ${folder}`,
    "All file paths MUST be relative to the project folder.",
    "",
    "Workflow:",
    "- For multi-step tasks, FIRST create a todo list with update_todos, then work through it.",
    "- Keep exactly one todo in_progress at a time. Update the list after every completed step.",
    "- Explore before editing: use Glob/Grep/Read to understand existing code.",
    "- Use Edit to write complete files. Mention a short description of each change.",
    "- Verify your work: run builds/tests with Shell after significant changes, and fix what breaks.",
    "- Never invent file contents you have not read. Never leave TODO placeholders in code.",
    "- Reply in the user's language (Arabic or English). Be concise between tool calls.",
  ].join("\n");
  if (!planMode) return base + buildSkillsSection(skills);
  return (
    base +
    buildSkillsSection(skills) +
    "\n\nPLAN MODE ACTIVE: For any non-trivial task, first build the todo list (update_todos) with all steps pending, briefly explain the plan, and wait for the user to approve before executing. Mark steps in_progress/completed as you go."
  );
}

export class AgentRunner {
  private controller = new AbortController();
  private messages: AgentMessage[] = [];
  private pendingImages: string[] = [];

  constructor(
    private config: ChatConfig,
    private projectRoot: string | null,
    private planMode: boolean,
    private autoApproveEdits: boolean,
    private hooks: AgentHooks,
    history: AgentMessage[],
    skills: SkillInfo[] = [],
  ) {
    this.messages = [...history];
    const system = systemPrompt(projectRoot, planMode, skills);
    if (!this.messages.some((m) => m.role === "system")) {
      this.messages.unshift({ role: "system", content: system });
    } else {
      (this.messages[0] as { role: "system"; content: string }).content = system;
    }
  }

  addUserTurn(text: string, images: string[] = []) {
    if (images.length === 0) {
      this.messages.push({ role: "user", content: text });
      return;
    }
    this.messages.push({
      role: "user",
      content: [
        { type: "text", text },
        ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ],
    });
  }

  stop() {
    this.controller.abort();
  }

  getHistory(): AgentMessage[] {
    return this.messages;
  }

  async run(): Promise<void> {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (!this.hooks.shouldContinue() || this.controller.signal.aborted) return;

      if (this.pendingImages.length > 0) {
        const images = this.pendingImages.splice(0);
        this.messages.push({
          role: "user",
          content: [
            { type: "text", text: "Attached images from the previous tool results:" },
            ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ],
        });
      }

      const assistantText = await this.streamCompletion();
      if (assistantText) this.hooks.onAssistantMessage(assistantText);

      const last = this.messages[this.messages.length - 1] as {
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
      const toolCalls = last?.tool_calls;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) return;

      for (const call of toolCalls) {
        if (!this.hooks.shouldContinue() || this.controller.signal.aborted) return;
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch {}

        this.hooks.onToolCall(name, call.function.arguments);
        const result = await this.executeTool(name, args);
        this.hooks.onToolResult(name, call.function.arguments, result);
        this.messages.push({ role: "tool", tool_call_id: call.id, content: result });

        if (result === "USER_REJECTED_EDIT") {
          this.messages.push({ role: "user", content: "The user rejected this edit. Ask how they want to proceed." });
        }
      }
    }
  }

  private async streamCompletion(): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: this.controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "HTTP-Referer": "https://github.com/bot-yar",
        "X-Title": "Bot Yar",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: this.messages,
        tools: TOOLS,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(`OpenRouter error ${response.status}: ${text.slice(0, 500)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        let event: {
          choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }>;
          error?: { message?: string };
        };
        try { event = JSON.parse(payload); } catch { continue; }
        if (event.error?.message) throw new Error(`OpenRouter: ${event.error.message}`);
        const delta = event.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          content += delta.content;
          this.hooks.onAssistantDelta(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: tc.id ?? "", type: "function", function: { name: "", arguments: "" } };
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }
    }

    if (content || toolCalls.length > 0) {
      this.messages.push({
        role: "assistant",
        content: content || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
    return content;
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const root = this.projectRoot;
    const str = (key: string, fallback = "") => (typeof args[key] === "string" ? (args[key] as string) : fallback);
    const needsRoot = !["update_todos", "ask_user", "WebSearch", "WebFetch"].includes(name);
    if (root == null && needsRoot) {
      return "No project folder selected. Ask the user to choose a project folder first (the 📁 button).";
    }
    const safeRoot = root as string;

    try {
      switch (name) {
        case "Read": {
          const relPath = str("path");
          const ext = relPath.toLowerCase().replace(/^.*(\.[a-z0-9]+)$/, "$1");
          if (IMAGE_EXTENSIONS.includes(ext)) {
            try {
              const dataUrl = await window.botyar.fsReadImage(safeRoot, relPath);
              this.pendingImages.push(dataUrl);
              return `Image loaded: ${relPath} — it is attached to the next message and you can see it.`;
            } catch (error) {
              return `Tool error: ${String(error)}`;
            }
          }
          const start = typeof args.start_line === "number" ? args.start_line : undefined;
          const end = typeof args.end_line === "number" ? args.end_line : undefined;
          return await window.botyar.fsRead(safeRoot, relPath, start, end);
        }
        case "LS": {
          const entries = await window.botyar.fsList(safeRoot, str("path", "."));
          const lines = entries.map((e) => `${e.type === "dir" ? "[dir]  " : "[file] "}${e.name}${e.type === "file" ? ` (${e.size}b)` : ""}`);
          return lines.length ? lines.join("\n") : "(empty folder)";
        }
        case "Glob": {
          const files = await window.botyar.fsGlob(safeRoot, str("pattern"));
          return files.length ? files.join("\n") : "(no matches)";
        }
        case "Grep": {
          const matches = await window.botyar.fsGrep(safeRoot, str("pattern"), str("glob", ""));
          return matches.length ? matches.join("\n") : "(no matches)";
        }
        case "Edit": {
          const relPath = str("path");
          const newContent = str("content");
          let before = "";
          try { before = await window.botyar.fsReadRaw(safeRoot, relPath); } catch { before = ""; }
          const proposal: EditProposal = { path: relPath, before, after: newContent, description: str("description", "") };
          this.hooks.onEditProposal(proposal);
          if (!this.autoApproveEdits) {
            const decision = await this.hooks.waitForEditApproval(proposal);
            if (decision === "rejected") return "USER_REJECTED_EDIT";
          }
          const res = await window.botyar.fsWrite(safeRoot, relPath, newContent);
          return `Saved ${res.written} chars to ${relPath}${before ? " (file updated)" : " (new file)"}`;
        }
        case "Shell": {
          const res = await window.botyar.runCommand(safeRoot, str("command"));
          const parts = [`exit code: ${res.code}`];
          if (res.stdout.trim()) parts.push(`stdout:\n${res.stdout.trim()}`);
          if (res.stderr.trim()) parts.push(`stderr:\n${res.stderr.trim()}`);
          return parts.join("\n").slice(0, 12000);
        }
        case "WebSearch": {
          const res = await window.botyar.netSearch(str("search_term"));
          if (res.error) return `Error: ${res.error}`;
          if (!res.results.length) return "(no results)";
          const date = new Date().toISOString().slice(0, 10);
          const docs = res.results.map((r) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.snippet}\n---`).join("\n");
          return `The current date is ${date}.\n\n${docs}`;
        }
        case "WebFetch": {
          const res = await window.botyar.netFetch(str("url"));
          if (res.error) return `Error fetching URL ${str("url")}: ${res.error}`;
          let content = res.content ?? "";
          const MAX_CONTENT_SIZE = 100_000;
          if (content.length > MAX_CONTENT_SIZE) {
            const omitted = content.slice(MAX_CONTENT_SIZE);
            const lines = (omitted.match(/\n/g) ?? []).length + 1;
            content = `${content.slice(0, MAX_CONTENT_SIZE)}\n\n...[${lines} line${lines === 1 ? "" : "s"} truncated]`;
          }
          return `# Content from ${str("url")}\n\n${content}`;
        }
        case "update_todos": {
          const todos = Array.isArray(args.todos)
            ? (args.todos as Array<{ id?: unknown; content?: unknown; status?: unknown }>).map((t) => ({
                id: String(t.id ?? ""),
                content: String(t.content ?? ""),
                status: (["pending", "in_progress", "completed", "cancelled"].includes(String(t.status))
                  ? String(t.status)
                  : "pending") as TodoStatus,
              }))
            : [];
          this.hooks.onTodos(todos);
          return `Todo list updated (${todos.length} items).`;
        }
        case "ask_user": {
          const options = Array.isArray(args.options) ? (args.options as unknown[]).map(String) : [];
          const answer = await this.hooks.askUser({ question: str("question"), options });
          return `User answered: ${answer}`;
        }
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      return `Tool error: ${String(error)}`;
    }
  }
}
