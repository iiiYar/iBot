import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentRunner, type AgentMessage, type AgentHooks, type TodoItem, type EditProposal, type PendingQuestion, type SkillInfo } from "./agent";
import { TranscriptCardFrame } from "./sand/TranscriptCardFrame";
import { STRINGS, type Lang } from "./i18n";
import "./sand/sand.css";

type ChatEntry =
  | { kind: "user"; text: string; images?: string[] }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; args: string; result: string }
  | { kind: "edit"; proposal: EditProposal; approved: boolean }
  | { kind: "error"; text: string };

type TreeNode = { name: string; type: "dir" | "file"; size: number };

type SessionData = {
  id: string;
  title: string;
  projectRoot: string | null;
  createdAt: number;
  updatedAt: number;
  history: AgentMessage[];
  entries: ChatEntry[];
  todos: TodoItem[];
  running: boolean;
  streaming: string;
};

type AppConfig = { apiKey: string; model: string; autoApprove: boolean; lang: Lang; customModels: string[] };

const MODELS = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { id: "openai/gpt-4.1", label: "GPT-4.1" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1" },
  { id: "z-ai/glm-4.6", label: "GLM 4.6" },
  { id: "qwen/qwen3-coder", label: "Qwen3 Coder" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
];

const TOOL_ICONS: Record<string, string> = {
  Read: "📄", LS: "📂", Glob: "🔍", Grep: "🔎", Edit: "✏️", Shell: "⚡",
  WebSearch: "🌐", WebFetch: "🔗", update_todos: "☑️", ask_user: "❓",
};

function newId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

function freshSession(projectRoot: string | null = null): SessionData {
  return { id: newId(), title: "", projectRoot, createdAt: Date.now(), updatedAt: Date.now(), history: [], entries: [], todos: [], running: false, streaming: "" };
}

function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem("botyar-config-v3");
    if (raw) {
      const p = JSON.parse(raw) as Partial<AppConfig>;
      return {
        apiKey: p.apiKey ?? "", model: p.model ?? MODELS[0].id,
        autoApprove: p.autoApprove ?? false,
        lang: p.lang === "ar" ? "ar" : "en",
        customModels: Array.isArray(p.customModels) ? p.customModels.filter((m): m is string => typeof m === "string") : [],
      };
    }
  } catch {}
  return { apiKey: "", model: MODELS[0].id, autoApprove: false, lang: "en", customModels: [] };
}

function renderInline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) return <b key={i}>{renderInline(seg.slice(2, -2))}</b>;
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2)
      return <code key={i} className="inline-code" dir="auto">{seg.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });
}

function renderTextBlock(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  let key = 0;
  const flushList = () => {
    if (!list.length) return;
    const items = list; const isOrdered = ordered;
    out.push(isOrdered
      ? <ol key={`l${key++}`}>{items.map((item, i) => <li key={i} dir="auto">{renderInline(item)}</li>)}</ol>
      : <ul key={`l${key++}`}>{items.map((item, i) => <li key={i} dir="auto">{renderInline(item)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)/.exec(line);
    if (heading) {
      flushList();
      out.push(<div key={`h${key++}`} className={`md-h h${heading[1].length}`} dir="auto">{renderInline(heading[2])}</div>);
      continue;
    }
    const ul = /^[-*•]\s+(.*)/.exec(line);
    if (ul) { if (ordered) flushList(); ordered = false; list.push(ul[1]); continue; }
    const ol = /^(\d+)[.)]\s+(.*)/.exec(line);
    if (ol) { if (!ordered && list.length) flushList(); ordered = true; list.push(ol[2]); continue; }
    flushList();
    if (!line.trim()) continue;
    out.push(<p key={`p${key++}`} dir="auto">{renderInline(line)}</p>);
  }
  flushList();
  return out;
}

function renderMarkdown(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = /```([\w-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0; let match: RegExpExecArray | null; let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(...renderTextBlock(text.slice(last, match.index)));
    parts.push(
      <div key={`c${key++}`} className="code-block">
        {match[1] && <div className="code-lang">{match[1]}</div>}
        <pre>{match[2].replace(/\n$/, "")}</pre>
      </div>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(...renderTextBlock(text.slice(last)));
  return parts;
}

function lineDiff(before: string, after: string) {
  const a = before.split("\n"); const b = after.split("\n");
  const n = Math.min(a.length, 400); const m = Math.min(b.length, 400);
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows: Array<{ type: "same" | "add" | "del"; text: string }> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ type: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ type: "del", text: a[i] }); i++; }
    else { rows.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) { rows.push({ type: "del", text: a[i] }); i++; }
  while (j < m) { rows.push({ type: "add", text: b[j] }); j++; }
  return rows;
}

function FileTree({ root, refreshKey, emptyText }: { root: string; refreshKey: number; emptyText: string }) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => { void window.botyar.fsList(root, ".").then(setTree).catch(() => setTree([])); }, [root, refreshKey]);
  const toggle = useCallback((rel: string) => {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(rel)) next.delete(rel); else next.add(rel); return next; });
  }, []);
  const renderNodes = (nodes: TreeNode[], parentRel: string, depth: number): React.ReactNode =>
    nodes.map((node) => {
      const rel = parentRel === "." ? node.name : `${parentRel}/${node.name}`;
      if (node.type === "dir") {
        const isOpen = expanded.has(rel);
        return (
          <div key={rel}>
            <div className="tree-row dir" style={{ paddingInlineStart: 10 + depth * 14 }} onClick={() => toggle(rel)}>
              <span className="chev">{isOpen ? "▾" : "▸"}</span> {node.name}
            </div>
            {isOpen && <ExpandedDir root={root} rel={rel} depth={depth + 1} expanded={expanded} toggle={toggle} refreshKey={refreshKey} />}
          </div>
        );
      }
      return <div key={rel} className="tree-row file" style={{ paddingInlineStart: 24 + depth * 14 }}>{node.name}</div>;
    });
  if (!tree.length) return <div className="sidebar-empty">{emptyText}</div>;
  return <div className="tree">{renderNodes(tree, ".", 0)}</div>;
}

function ExpandedDir({ root, rel, depth, expanded, toggle, refreshKey }: {
  root: string; rel: string; depth: number; expanded: Set<string>; toggle: (r: string) => void; refreshKey: number;
}) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  useEffect(() => { void window.botyar.fsList(root, rel).then(setNodes).catch(() => setNodes([])); }, [root, rel, refreshKey]);
  if (nodes === null) return <div className="tree-row" style={{ paddingInlineStart: 10 + depth * 14 }}>…</div>;
  const render = (items: TreeNode[], parentRel: string, d: number): React.ReactNode =>
    items.map((node) => {
      const childRel = `${parentRel}/${node.name}`;
      if (node.type === "dir") {
        const isOpen = expanded.has(childRel);
        return (
          <div key={childRel}>
            <div className="tree-row dir" style={{ paddingInlineStart: 10 + d * 14 }} onClick={() => toggle(childRel)}>
              <span className="chev">{isOpen ? "▾" : "▸"}</span> {node.name}
            </div>
            {isOpen && <ExpandedDir root={root} rel={childRel} depth={d + 1} expanded={expanded} toggle={toggle} refreshKey={refreshKey} />}
          </div>
        );
      }
      return <div key={childRel} className="tree-row file" style={{ paddingInlineStart: 24 + d * 14 }}>{node.name}</div>;
    });
  return <>{render(nodes, rel, depth)}</>;
}

function ToolCard({ name, args, result, icon }: { name: string; args: string; result: string; icon: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TranscriptCardFrame variant="file" className="tool-frame">
      <button className="tool-summary" onClick={() => setOpen((o) => !o)}>
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{name}</span>
        {result !== "" ? <span className="tool-status done">✓</span> : <span className="tool-status spinner" />}
      </button>
      {open && args && <pre className="tool-args" dir="ltr">{args}</pre>}
      {open && result && <pre className="tool-result" dir="ltr">{result}</pre>}
    </TranscriptCardFrame>
  );
}

function EditCard({ proposal, diff }: { proposal: EditProposal; diff: Array<{ type: "same" | "add" | "del"; text: string }> }) {
  const [open, setOpen] = useState(true);
  return (
    <TranscriptCardFrame variant="widget" className="edit-frame">
      <button className="tool-summary" onClick={() => setOpen((o) => !o)}>
        <span className="tool-icon">✏️</span>
        <span className="tool-name" dir="ltr">{proposal.path}</span>
        {proposal.description && <span className="muted">{proposal.description}</span>}
      </button>
      {open && (
        <div className="diff" dir="ltr">
          {diff.map((row, j) => (
            <div key={j} className={`diff-row ${row.type}`}>
              <span className="diff-sign">{row.type === "add" ? "+" : row.type === "del" ? "−" : " "}</span>
              <span className="diff-text">{row.text || " "}</span>
            </div>
          ))}
        </div>
      )}
    </TranscriptCardFrame>
  );
}

function QuestionCard({ question, options, onAnswer, sendLabel }: {
  question: PendingQuestion; options: string[]; onAnswer: (a: string) => void; sendLabel: string;
}) {
  const [answer, setAnswer] = useState("");
  return (
    <TranscriptCardFrame variant="question" className="question-frame">
      <div className="question-inner">
        <div className="question-text" dir="auto">{question.question}</div>
        {options.length > 0 ? (
          <div className="question-options">
            {options.map((opt, i) => <button key={i} className="btn option" onClick={() => onAnswer(opt)}>{opt}</button>)}
          </div>
        ) : (
          <div className="question-free">
            <input value={answer} autoFocus placeholder="…"
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && answer.trim()) onAnswer(answer.trim()); }} />
            <button className="btn primary sm" disabled={!answer.trim()} onClick={() => onAnswer(answer.trim())}>{sendLabel}</button>
          </div>
        )}
      </div>
    </TranscriptCardFrame>
  );
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"idle" | "testing" | "ok" | "bad">("idle");
  const [newModel, setNewModel] = useState("");
  const [modelError, setModelError] = useState("");
  const [planMode, setPlanMode] = useState(true);
  const [sidebarView, setSidebarView] = useState<"sessions" | "files" | "todos">("sessions");
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<SessionData[]>(() => [freshSession()]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [editApproval, setEditApproval] = useState<{ sessionId: string; proposal: EditProposal; resolve: (d: "approved" | "rejected") => void } | null>(null);
  const [userQuestion, setUserQuestion] = useState<{ sessionId: string; q: PendingQuestion; resolve: (a: string) => void } | null>(null);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const t = STRINGS[config.lang];
  const dir = config.lang === "ar" ? "rtl" : "ltr";
  const allModels = useMemo(() => [...MODELS, ...config.customModels.map((id) => ({ id, label: id }))], [config.customModels]);
  const modelLabel = allModels.find((m) => m.id === config.model)?.label ?? config.model;

  const patchSession = useCallback((id: string, patch: Partial<SessionData> | ((s: SessionData) => Partial<SessionData>)) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch), updatedAt: Date.now() } : s)));
  }, []);

  useEffect(() => {
    if (!activeId && sessions[0]) setActiveId(sessions[0].id);
  }, [activeId, sessions]);

  useEffect(() => { localStorage.setItem("botyar-config-v3", JSON.stringify(config)); }, [config]);

  useEffect(() => {
    void window.botyar.sessionsList().then((loaded) => {
      const parsed = (loaded as SessionData[]).filter((s) => s && typeof s.id === "string" && Array.isArray(s.entries));
      if (parsed.length > 0) {
        setSessions(parsed.map((s) => ({ ...s, running: false, streaming: "" })));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (active?.projectRoot) void window.botyar.skillsList(active.projectRoot).then(setSkills).catch(() => setSkills([]));
  }, [active?.projectRoot]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = "0px"; el.style.height = `${Math.min(el.scrollHeight, 180)}px`; }
  }, [input]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!showSettings) { setKeyStatus("idle"); setModelError(""); }
  }, [showSettings]);

  const testKey = useCallback(async () => {
    if (!config.apiKey.trim()) { setKeyStatus("bad"); return; }
    setKeyStatus("testing");
    try {
      const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${config.apiKey.trim()}` } });
      setKeyStatus(res.ok ? "ok" : "bad");
    } catch { setKeyStatus("bad"); }
  }, [config.apiKey]);

  const addModel = useCallback(() => {
    const id = newModel.trim();
    setModelError("");
    if (!id) return;
    if (!/^[a-zA-Z0-9._\-/:]+$/.test(id)) { setModelError("Invalid model id"); return; }
    if (allModels.some((m) => m.id === id)) { setModelError("Already in the list"); setNewModel(""); return; }
    setConfig((c) => ({ ...c, customModels: [...c.customModels, id], model: id }));
    setNewModel("");
  }, [newModel, allModels]);

  const removeModel = useCallback((id: string) => {
    setConfig((c) => ({ ...c, customModels: c.customModels.filter((m) => m !== id), model: c.model === id ? MODELS[0].id : c.model }));
  }, []);

  const saveSession = useCallback((session: SessionData) => {
    void window.botyar.sessionsSave({
      id: session.id, title: session.title, projectRoot: session.projectRoot,
      createdAt: session.createdAt, updatedAt: session.updatedAt,
      history: session.history, entries: session.entries, todos: session.todos,
    }).catch(() => {});
  }, []);

  const makeHooks = useCallback((sessionId: string): AgentHooks => ({
    onAssistantDelta: (chunk) => patchSession(sessionId, (s) => ({ streaming: s.streaming + chunk })),
    onAssistantMessage: (text) => {
      patchSession(sessionId, (s) => ({
        streaming: "",
        entries: text.trim() ? [...s.entries, { kind: "assistant" as const, text }] : s.entries,
      }));
    },
    onToolCall: (name, args) => patchSession(sessionId, (s) => ({ entries: [...s.entries, { kind: "tool" as const, name, args, result: "" }] })),
    onToolResult: (_name, _args, result) => {
      patchSession(sessionId, (s) => {
        const entries = [...s.entries];
        for (let i = entries.length - 1; i >= 0; i--) {
          const entry = entries[i];
          if (entry.kind === "tool" && entry.result === "") { entries[i] = { ...entry, result }; break; }
        }
        return { entries };
      });
      if (result.includes("Saved ") && result.includes(" chars to ")) setTreeRefresh((k) => k + 1);
    },
    onTodos: (items) => patchSession(sessionId, { todos: items }),
    onEditProposal: () => {},
    waitForEditApproval: (proposal) =>
      new Promise((resolve) => {
        patchSession(sessionId, (s) => ({ entries: [...s.entries, { kind: "edit" as const, proposal, approved: false }] }));
        setEditApproval({ sessionId, proposal, resolve: (d) => { resolve(d); setEditApproval(null); } });
      }),
    askUser: (q) =>
      new Promise((resolve) => {
        setUserQuestion({ sessionId, q, resolve: (a) => { resolve(a); setUserQuestion(null); } });
      }),
    shouldContinue: () => continueRefs.current.get(sessionId) === true,
  }), [patchSession]);

  const continueRefs = useRef(new Map<string, boolean>());
  const runnerRefs = useRef(new Map<string, AgentRunner>());
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async (sessionId: string, overrideText?: string, images: string[] = []) => {
    const session = sessions.find((s) => s.id === sessionId);
    const text = (overrideText ?? input).trim();
    if (!text || !session || session.running) return;
    if (!config.apiKey) { setShowSettings(true); return; }

    setSessions((prev) => prev.map((s) => s.id === sessionId
      ? { ...s, entries: [...s.entries, { kind: "user" as const, text, images: images.length ? images : undefined }], running: true, streaming: "", title: s.title || text.slice(0, 46), updatedAt: Date.now() }
      : s));

    const skillsForRun = await window.botyar.skillsList(session.projectRoot ?? "").catch(() => []);
    const runner = new AgentRunner(
      { apiKey: config.apiKey, model: config.model },
      session.projectRoot,
      planMode,
      config.autoApprove,
      makeHooks(sessionId),
      session.history,
      skillsForRun,
    );
    runnerRefs.current.set(sessionId, runner);
    continueRefs.current.set(sessionId, true);
    runner.addUserTurn(text, images);

    try {
      await runner.run();
    } catch (error) {
      patchSession(sessionId, (s) => ({ entries: [...s.entries, { kind: "error" as const, text: String(error) }] }));
    } finally {
      patchSession(sessionId, { running: false, streaming: "" });
      runnerRefs.current.delete(sessionId);
      const updated = sessionsRef.current.find((s) => s.id === sessionId);
      if (updated) saveSession(updated);
    }
  }, [input, sessions, config, planMode, makeHooks, patchSession, saveSession]);

  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const stop = useCallback((sessionId: string) => {
    continueRefs.current.set(sessionId, false);
    runnerRefs.current.get(sessionId)?.stop();
  }, []);

  const createSession = useCallback(() => {
    const s = freshSession(active?.projectRoot ?? null);
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
  }, [active?.projectRoot]);

  const deleteSession = useCallback((id: string) => {
    void window.botyar.sessionsDelete(id);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) { const fresh = freshSession(); setActiveId(fresh.id); return [fresh]; }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }, [activeId]);

  const pickFolder = useCallback(async () => {
    const folder = await window.botyar.pickFolder();
    if (folder && active) patchSession(active.id, { projectRoot: folder });
  }, [active, patchSession]);

  const addImagesFromFiles = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => setAttachedImages((prev) => [...prev, String(reader.result)]);
      reader.readAsDataURL(file);
    }
  }, []);

  const slashQuery = active && input.startsWith("/") && !input.includes(" ") ? input.slice(1).toLowerCase() : null;
  const slashMatches = slashQuery !== null ? skills.filter((s) => s.name.toLowerCase().startsWith(slashQuery)) : [];

  const activeToolCount = active?.entries.filter((e) => e.kind === "tool").length ?? 0;
  const suggestions = [t.suggestion1, t.suggestion2, t.suggestion3, t.suggestion4];

  if (!active) return null;

  return (
    <div className="app" dir={dir}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand"><span className="logo">◈</span><span className="name">{t.appName}</span></div>
          <button className="icon-btn" title={t.settings} onClick={() => setShowSettings(true)}>⚙</button>
        </div>

        <button className="new-chat-btn" onClick={createSession}><span className="plus">+</span> {t.newChat}</button>

        <button className="project-chip" onClick={pickFolder} title={active.projectRoot ?? t.pickFolder}>
          <span className="folder-icon">📁</span>
          <span className="project-name">{active.projectRoot ? active.projectRoot.split(/[\\/]/).pop() : t.noFolder}</span>
        </button>

        <div className="sidebar-section">
          <div className="segment">
            <button className={sidebarView === "sessions" ? "active" : ""} onClick={() => setSidebarView("sessions")}>{t.sessions}</button>
            <button className={sidebarView === "files" ? "active" : ""} onClick={() => setSidebarView("files")}>{t.files}</button>
            <button className={sidebarView === "todos" ? "active" : ""} onClick={() => setSidebarView("todos")}>
              {t.todos}{active.todos.some((x) => x.status === "in_progress") && <span className="pulse-dot" />}
            </button>
          </div>
          <div className="sidebar-content">
            {sidebarView === "sessions" && (
              <div className="sessions-panel">
                {sessions.map((s) => (
                  <div key={s.id} className={`session-row ${s.id === activeId ? "active" : ""}`} onClick={() => setActiveId(s.id)}>
                    <div className="session-main">
                      <div className="session-title">{s.running && <span className="pulse-dot" />} {s.title || t.newChat}</div>
                      <div className="session-sub" dir="auto">{s.projectRoot ? s.projectRoot.split(/[\\/]/).pop() : t.noFolder}</div>
                    </div>
                    <button className="session-delete" title="✕" onClick={(e) => { e.stopPropagation(); stop(s.id); deleteSession(s.id); }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {sidebarView === "files" && (active.projectRoot
              ? <FileTree root={active.projectRoot} refreshKey={treeRefresh} emptyText={t.noFiles} />
              : <div className="sidebar-empty">{t.emptyProject}</div>)}
            {sidebarView === "todos" && (
              <div className="todos-panel">
                {active.todos.length === 0 && <div className="sidebar-empty">{t.noTodos}</div>}
                {active.todos.map((td) => (
                  <div key={td.id} className={`todo-item ${td.status}`}>
                    <span className="todo-check">
                      {td.status === "completed" ? "✓" : td.status === "in_progress" ? "●" : td.status === "cancelled" ? "×" : "○"}
                    </span>
                    <span>{td.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-foot">
          <button className="lang-btn" onClick={() => setConfig((c) => ({ ...c, lang: c.lang === "en" ? "ar" : "en" }))}>🌐 {t.language}</button>
        </div>
      </aside>

      <div className="main">
        {showSettings && (
          <div className="settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="settings-card" onClick={(e) => e.stopPropagation()} dir={dir}>
              <div className="settings-title">{t.settings}</div>
              <div className="field">
                <label>{t.apiKey}</label>
                <div className="key-row">
                  <input type={showKey ? "text" : "password"} value={config.apiKey} placeholder="sk-or-v1-..." dir="ltr"
                    onChange={(e) => { setConfig((c) => ({ ...c, apiKey: e.target.value })); setKeyStatus("idle"); }} />
                  <button className="btn sm ghost" onClick={() => setShowKey((s) => !s)}>{showKey ? "🙈" : "👁"}</button>
                  <button className="btn sm" onClick={() => void testKey()} disabled={keyStatus === "testing"}>{keyStatus === "testing" ? "…" : "✓"}</button>
                </div>
                {keyStatus === "ok" && <span className="status ok">✓ Key valid</span>}
                {keyStatus === "bad" && <span className="status bad">✕ Invalid key or network error</span>}
              </div>
              <div className="field">
                <label>{t.model}</label>
                <select value={config.model} onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))} dir="ltr">
                  {!allModels.some((m) => m.id === config.model) && <option value={config.model}>{config.model}</option>}
                  {MODELS.length > 0 && <optgroup label="Popular">{MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>}
                  {config.customModels.length > 0 && <optgroup label="My models">{config.customModels.map((id) => <option key={id} value={id}>{id}</option>)}</optgroup>}
                </select>
              </div>
              <div className="field">
                <label>Add custom model (vendor/name from openrouter.ai/models)</label>
                <div className="key-row">
                  <input value={newModel} dir="ltr" placeholder="e.g. mistralai/mistral-large"
                    onChange={(e) => { setNewModel(e.target.value); setModelError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") addModel(); }} />
                  <button className="btn sm primary" onClick={addModel} disabled={!newModel.trim()}>+</button>
                </div>
                {modelError && <span className="status bad">{modelError}</span>}
                {config.customModels.length > 0 && (
                  <div className="custom-models" dir="ltr">
                    {config.customModels.map((id) => (
                      <div key={id} className={`custom-model-row ${id === config.model ? "current" : ""}`}>
                        <button className="use-model" onClick={() => setConfig((c) => ({ ...c, model: id }))}>{id}</button>
                        <button className="remove-model" onClick={() => removeModel(id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label className="check-row">
                <input type="checkbox" checked={config.autoApprove} onChange={(e) => setConfig((c) => ({ ...c, autoApprove: e.target.checked }))} />
                {t.autoApprove}
              </label>
              <p className="hint">{t.keyHint}</p>
              <button className="btn primary" onClick={() => setShowSettings(false)}>OK</button>
            </div>
          </div>
        )}

        <header className="chat-header">
          <div className="model-picker" ref={modelMenuRef}>
            <button className="model-btn" onClick={() => setModelMenuOpen((o) => !o)}>
              <span className="model-dot" /> <span dir="ltr">{modelLabel}</span> <span className="chev-down">▾</span>
            </button>
            {modelMenuOpen && (
              <div className="model-menu" dir="ltr">
                {allModels.map((m) => (
                  <button key={m.id} className={m.id === config.model ? "active" : ""}
                    onClick={() => { setConfig((c) => ({ ...c, model: m.id })); setModelMenuOpen(false); }}>{m.label}</button>
                ))}
                <div className="menu-divider" />
                <button className="menu-action" onClick={() => { setModelMenuOpen(false); setShowSettings(true); }}>⚙ Manage models…</button>
              </div>
            )}
          </div>
          <label className="chip-toggle">
            <input type="checkbox" checked={planMode} onChange={(e) => setPlanMode(e.target.checked)} />
            <span>📋 {t.planMode}</span>
          </label>
          <div className="spacer" />
          {active.running && <span className="running-indicator"><span className="pulse-dot" /> {activeToolCount}</span>}
        </header>

        <main className="chat">
          {active.entries.length === 0 && !active.streaming ? (
            <div className="welcome">
              <div className="welcome-logo">◈</div>
              <h1>{t.welcomeTitle}</h1>
              <p>{t.welcomeSub}</p>
              <div className="suggestions">
                {suggestions.map((s, i) => (
                  <button key={i} className="suggestion-card" onClick={() => void send(active.id, s)}>
                    <span>{s}</span><span className="arrow">→</span>
                  </button>
                ))}
              </div>
              {skills.length > 0 && (
                <div className="skills-hint">
                  {skills.map((s) => (
                    <button key={s.path} className="skill-chip" onClick={() => { setInput(`/${s.name} `); textareaRef.current?.focus(); }}>
                      /{s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="thread">
              {active.entries.map((entry, i) => {
                if (entry.kind === "user")
                  return (
                    <div key={i} className="msg user">
                      <div className="user-bubble" dir="auto">
                        {entry.text}
                        {entry.images && entry.images.length > 0 && (
                          <div className="bubble-images">{entry.images.map((src, j) => <img key={j} src={src} alt="" />)}</div>
                        )}
                      </div>
                    </div>
                  );
                if (entry.kind === "assistant")
                  return <div key={i} className="msg assistant"><div className="md">{renderMarkdown(entry.text)}</div></div>;
                if (entry.kind === "error")
                  return <div key={i} className="msg"><div className="error-card">{entry.text}</div></div>;
                if (entry.kind === "edit")
                  return <div key={i} className="msg"><EditCard proposal={entry.proposal} diff={lineDiff(entry.proposal.before, entry.proposal.after)} /></div>;
                return <div key={i} className="msg"><ToolCard name={entry.name} args={entry.args} result={entry.result} icon={TOOL_ICONS[entry.name] ?? "🔧"} /></div>;
              })}

              {active.todos.length > 0 && (
                <div className="msg">
                  <div className="todos-card">
                    {active.todos.map((td) => (
                      <div key={td.id} className={`todo-line ${td.status}`}>
                        <span className="todo-check">
                          {td.status === "completed" ? "✓" : td.status === "in_progress" ? "●" : td.status === "cancelled" ? "×" : "○"}
                        </span>
                        <span dir="auto">{td.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editApproval && editApproval.sessionId === active.id && (
                <div className="approval-bar">
                  <span>{t.approveEdit} <b dir="ltr">{editApproval.proposal.path}</b>؟</span>
                  <button className="btn primary sm" onClick={() => editApproval.resolve("approved")}>✓</button>
                  <button className="btn danger sm" onClick={() => editApproval.resolve("rejected")}>✕</button>
                </div>
              )}

              {userQuestion && userQuestion.sessionId === active.id && (
                <div className="msg">
                  <QuestionCard question={userQuestion.q} options={userQuestion.q.options} sendLabel={t.send}
                    onAnswer={(a) => userQuestion.resolve(a)} />
                </div>
              )}

              {active.streaming && <div className="msg assistant"><div className="md streaming">{renderMarkdown(active.streaming)}</div></div>}
              {active.running && !active.streaming && <div className="thinking"><span /><span /><span /></div>}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <footer className="composer-wrap">
          <div className="composer">
            {slashOpen && slashMatches.length > 0 && (
              <div className="slash-menu">
                {slashMatches.map((s) => (
                  <button key={s.path} onClick={() => { setInput(`/${s.name} `); setSlashOpen(false); textareaRef.current?.focus(); }}>
                    <span className="slash-name">/{s.name}</span>
                    <span className="slash-desc">{s.description}</span>
                  </button>
                ))}
              </div>
            )}
            {attachedImages.length > 0 && (
              <div className="attach-row">
                {attachedImages.map((src, i) => (
                  <div key={i} className="attach-thumb">
                    <img src={src} alt="" />
                    <button onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              placeholder={t.inputPlaceholder}
              onChange={(e) => { setInput(e.target.value); setSlashOpen(e.target.value.startsWith("/") && !e.target.value.includes(" ")); }}
              onKeyDown={(e) => {
                if (slashOpen && slashMatches.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
                  e.preventDefault();
                  setInput(`/${slashMatches[0].name} `);
                  setSlashOpen(false);
                  return;
                }
                if (e.key === "Escape") setSlashOpen(false);
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(active.id, undefined, attachedImages); setAttachedImages([]); setSlashOpen(false); }
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
                if (files.length > 0) { e.preventDefault(); addImagesFromFiles(files); }
              }}
              disabled={active.running}
              rows={1}
            />
            <div className="composer-bar">
              <div className="composer-left">
                <button className="mini-chip clickable" title="Attach image" onClick={() => fileInputRef.current?.click()}>📎</button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple hidden
                  onChange={(e) => { if (e.target.files) addImagesFromFiles(e.target.files); e.target.value = ""; }} />
                <span className="mini-chip" dir="ltr">{modelLabel}</span>
                {planMode && <span className="mini-chip accent">📋 {t.planMode}</span>}
              </div>
              {active.running
                ? <button className="send-btn stop" onClick={() => stop(active.id)} title={t.stop}>■</button>
                : <button className="send-btn" onClick={() => { void send(active.id, undefined, attachedImages); setAttachedImages([]); setSlashOpen(false); }} disabled={!input.trim()} title={t.send}>↑</button>}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
