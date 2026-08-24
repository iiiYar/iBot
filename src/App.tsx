import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentRunner, type AgentMessage, type AgentHooks, type TodoItem, type EditProposal, type PendingQuestion, type SkillInfo, type McpToolMeta } from "./agent";
import { STRINGS, type Lang } from "./i18n";
import { useWorkspace } from "./hooks/useWorkspace";
import { Sidebar }       from "./components/Sidebar";
import { ChatHeader }    from "./components/ChatHeader";
import { ChatThread, type ChatEntry } from "./components/ChatThread";
import { Composer }      from "./components/Composer";
import { SettingsModal, type SettingsConfig } from "./components/SettingsModal";
import type { Session } from "./types/workspace";
import type { McpToolInfo } from "./global";
import type { TokenUsageData } from "./TokenUsage";
import "./sand/sand.css";
import "./styles.css";

// ── Types ──────────────────────────────────────────────────────────────
type LiveSession = {
  entries:     ChatEntry[];
  todos:       TodoItem[];
  running:     boolean;
  streaming:   string;
  history:     AgentMessage[];
  projectRoot: string | null;
  tokenUsage:  TokenUsageData;
};

// ── Config helpers ──────────────────────────────────────────────────
function loadConfig(): SettingsConfig {
  try {
    const raw = localStorage.getItem("botyar-config-v3");
    if (raw) {
      const p = JSON.parse(raw) as Partial<SettingsConfig>;
      return {
        apiKey:       p.apiKey ?? "",
        model:        p.model  ?? "anthropic/claude-sonnet-4.5",
        autoApprove:  p.autoApprove ?? false,
        lang:         p.lang === "ar" ? "ar" : "en",
        customModels: Array.isArray(p.customModels)
          ? p.customModels.filter((m): m is string => typeof m === "string")
          : [],
      };
    }
  } catch {}
  return { apiKey: "", model: "anthropic/claude-sonnet-4.5", autoApprove: false, lang: "en", customModels: [] };
}

function emptyLive(projectRoot: string | null = null): LiveSession {
  return { entries: [], todos: [], running: false, streaming: "", history: [], projectRoot, tokenUsage: { prompt: 0, completion: 0, total: 0 } };
}

function newId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  const ws = useWorkspace();

  const [config,       setConfig]       = useState<SettingsConfig>(loadConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState<"general" | "mcp" | "docker">("general");
  const [planMode,     setPlanMode]     = useState(true);
  const [mcpTools,     setMcpTools]     = useState<McpToolInfo[]>([]);
  const [skills,       setSkills]       = useState<SkillInfo[]>([]);
  const [treeRefresh,  setTreeRefresh]  = useState(0);

  const [liveSessions, setLiveSessions] = useState<Map<string, LiveSession>>(new Map());
  const [editApproval, setEditApproval] = useState<{ sessionId: string; proposal: EditProposal; resolve: (d: "approved" | "rejected") => void } | null>(null);
  const [userQuestion, setUserQuestion] = useState<{ sessionId: string; q: PendingQuestion; resolve: (a: string) => void } | null>(null);

  const continueRefs = useRef(new Map<string, boolean>());
  const runnerRefs   = useRef(new Map<string, AgentRunner>());
  const composerRef  = useRef<HTMLTextAreaElement>(null);

  // ── Persist config
  useEffect(() => { localStorage.setItem("botyar-config-v3", JSON.stringify(config)); }, [config]);

  // ── Load MCP tools on mount
  useEffect(() => { void window.botyar.mcpListAllTools().then(setMcpTools).catch(() => {}); }, []);

  // ── Skills per project
  const projectRoot = ws.activeSession ? (getLive(ws.activeSession.id).projectRoot ?? ws.activeProject?.rootPath ?? null) : null;
  useEffect(() => {
    if (projectRoot) void window.botyar.skillsList(projectRoot).then(setSkills).catch(() => setSkills([]));
    else setSkills([]);
  }, [projectRoot]);

  // ── Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ",") { e.preventDefault(); setShowSettings(true); setSettingsTab("general"); }
      if (e.ctrlKey && e.key === "n") { e.preventDefault(); void createSession(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Live session helpers
  function getLive(id: string): LiveSession {
    return liveSessions.get(id) ?? emptyLive();
  }

  const patchLive = useCallback((id: string, patch: Partial<LiveSession> | ((s: LiveSession) => Partial<LiveSession>)) => {
    setLiveSessions((prev) => {
      const current = prev.get(id) ?? emptyLive();
      const delta   = typeof patch === "function" ? patch(current) : patch;
      const next    = new Map(prev);
      next.set(id, { ...current, ...delta });
      return next;
    });
  }, []);

  // ── Derived
  const active     = ws.activeSession;
  const activeLive = active ? getLive(active.id) : null;
  const t          = STRINGS[config.lang];
  const dir        = config.lang === "ar" ? "rtl" : "ltr";

  const projectSessions = ws.sessions.filter((s) =>
    ws.activeProject ? s.projectId === ws.activeProject.id : !s.projectId
  );

  // sync projectRoot from workspace
  useEffect(() => {
    if (active && ws.activeProject && !getLive(active.id).projectRoot) {
      patchLive(active.id, { projectRoot: ws.activeProject.rootPath });
    }
  }, [active?.id, ws.activeProject?.id]);

  // ── Hooks factory
  const makeHooks = useCallback((sessionId: string): AgentHooks & { onTokenUsage?: (u: TokenUsageData) => void } => ({
    onAssistantDelta:   (chunk) => patchLive(sessionId, (s) => ({ streaming: s.streaming + chunk })),
    onAssistantMessage: (text)  => patchLive(sessionId, (s) => ({
      streaming: "",
      entries:   text.trim() ? [...s.entries, { kind: "assistant" as const, text }] : s.entries,
    })),
    onToolCall:   (name, args)         => patchLive(sessionId, (s) => ({ entries: [...s.entries, { kind: "tool" as const, name, args, result: "" }] })),
    onToolResult: (_name, _args, result) => {
      patchLive(sessionId, (s) => {
        const entries = [...s.entries];
        for (let i = entries.length - 1; i >= 0; i--) {
          const e = entries[i];
          if (e.kind === "tool" && e.result === "") { entries[i] = { ...e, result }; break; }
        }
        return { entries };
      });
      if (result.includes("Saved ") && result.includes(" chars to ")) setTreeRefresh((k) => k + 1);
    },
    onTodos: (items) => patchLive(sessionId, { todos: items }),
    onEditProposal: () => {},
    waitForEditApproval: (proposal) =>
      new Promise((resolve) => {
        patchLive(sessionId, (s) => ({ entries: [...s.entries, { kind: "edit" as const, proposal, approved: false }] }));
        setEditApproval({ sessionId, proposal, resolve: (d) => { resolve(d); setEditApproval(null); } });
      }),
    askUser: (q) =>
      new Promise((resolve) => {
        setUserQuestion({ sessionId, q, resolve: (a) => { resolve(a); setUserQuestion(null); } });
      }),
    shouldContinue: () => continueRefs.current.get(sessionId) === true,
    onTokenUsage: (usage) => patchLive(sessionId, { tokenUsage: usage }),
  }), [patchLive]);

  // ── Send
  const send = useCallback(async (sessionId: string, text: string, images: string[] = []) => {
    const session = ws.sessions.find((s) => s.id === sessionId);
    const live    = getLive(sessionId);
    if (!text.trim() || !session || live.running) return;
    if (!config.apiKey) { setShowSettings(true); setSettingsTab("general"); return; }

    const title = session.title || text.slice(0, 46);
    ws.patchSession(sessionId, { title, model: config.model });
    patchLive(sessionId, (s) => ({
      entries:   [...s.entries, { kind: "user" as const, text, images: images.length ? images : undefined }],
      running:   true,
      streaming: "",
    }));

    const root        = live.projectRoot ?? ws.activeProject?.rootPath ?? null;
    const skillsForRun = await window.botyar.skillsList(root ?? "").catch(() => []);
    const mcpForRun    = await window.botyar.mcpListAllTools().catch(() => mcpTools) as McpToolMeta[];

    const hooks   = makeHooks(sessionId);
    const runner  = new AgentRunner(
      { apiKey: config.apiKey, model: config.model },
      root, planMode, config.autoApprove,
      hooks, live.history, skillsForRun, mcpForRun,
    );
    runnerRefs.current.set(sessionId, runner);
    continueRefs.current.set(sessionId, true);
    runner.addUserTurn(text, images);

    try {
      await runner.run();
    } catch (error) {
      patchLive(sessionId, (s) => ({ entries: [...s.entries, { kind: "error" as const, text: String(error) }] }));
    } finally {
      patchLive(sessionId, { running: false, streaming: "" });
      runnerRefs.current.delete(sessionId);
      const updatedLive = liveSessions.get(sessionId);
      if (updatedLive && session) {
        ws.persistSession({
          ...session, title,
          messages:    updatedLive.history,
          model:       config.model,
          tokenUsage:  updatedLive.tokenUsage,
          updatedAt:   Date.now(),
        });
      }
    }
  }, [ws, config, planMode, makeHooks, patchLive, getLive, liveSessions, mcpTools]);

  const stop = useCallback((sessionId: string) => {
    continueRefs.current.set(sessionId, false);
    runnerRefs.current.get(sessionId)?.stop();
  }, []);

  const createSession = useCallback(async () => {
    const root    = ws.activeProject?.rootPath ?? null;
    const pid     = ws.activeProject?.id;
    const session = await ws.createSession(pid);
    patchLive(session.id, emptyLive(root));
  }, [ws, patchLive]);

  const deleteSession = useCallback((id: string) => {
    stop(id);
    ws.deleteSession(id);
  }, [ws, stop]);

  const pickFolder = useCallback(async () => {
    const folder = await window.botyar.pickFolder();
    if (!folder) return;
    if (!ws.activeProject) {
      const name    = folder.split(/[\\/]/).pop() ?? "Project";
      const project = await ws.createProject(name, folder);
      if (active) patchLive(active.id, { projectRoot: folder });
      else {
        const session = await ws.createSession(project.id);
        patchLive(session.id, emptyLive(folder));
      }
    } else {
      if (active) patchLive(active.id, { projectRoot: folder });
    }
  }, [ws, active, patchLive]);

  const openSettings = useCallback((tab: "general" | "mcp" | "docker" = "general") => {
    setSettingsTab(tab);
    setShowSettings(true);
  }, []);

  // suggestions
  const suggestions = [t.suggestion1, t.suggestion2, t.suggestion3, t.suggestion4];

  // ── Empty-project landing ───────────────────────────────────────────
  if (!active) return (
    <div className="app" dir={dir}>
      <Sidebar
        lang={config.lang}
        projectRoot={null}
        sessions={[]}
        activeSessionId=""
        getLiveSession={() => ({ running: false, todos: [], projectRoot: null })}
        skills={skills}
        treeRefresh={treeRefresh}
        mcpToolCount={mcpTools.length}
        onNewSession={() => void createSession()}
        onPickFolder={() => void pickFolder()}
        onSwitchSession={() => {}}
        onDeleteSession={() => {}}
        onOpenSettings={openSettings}
        onSkillClick={(name) => { void createSession(); }}
        onLangToggle={() => setConfig((c) => ({ ...c, lang: c.lang === "en" ? "ar" : "en" }))}
      />
      <div className="main" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button className="btn primary" onClick={() => void createSession()}>{t.newChat}</button>
      </div>
    </div>
  );

  const activeToolCount = activeLive?.entries.filter((e) => e.kind === "tool").length ?? 0;

  return (
    <div className="app" dir={dir}>
      {/* ── Sidebar ── */}
      <Sidebar
        lang={config.lang}
        projectRoot={projectRoot}
        sessions={projectSessions}
        activeSessionId={active.id}
        getLiveSession={(id) => {
          const l = getLive(id);
          return { running: l.running, todos: l.todos, projectRoot: l.projectRoot };
        }}
        skills={skills}
        treeRefresh={treeRefresh}
        mcpToolCount={mcpTools.length}
        onNewSession={() => void createSession()}
        onPickFolder={() => void pickFolder()}
        onSwitchSession={(id) => ws.switchSession(id)}
        onDeleteSession={deleteSession}
        onOpenSettings={openSettings}
        onSkillClick={(name) => {
          // insert slash command into composer
          const el = composerRef.current as HTMLTextAreaElement & { insertText?: (t: string) => void } | null;
          el?.insertText?.(`/${name} `);
        }}
        onLangToggle={() => setConfig((c) => ({ ...c, lang: c.lang === "en" ? "ar" : "en" }))}
      />

      <div className="main">
        {/* ── Settings modal ── */}
        {showSettings && (
          <SettingsModal
            config={config}
            initialTab={settingsTab}
            onConfigChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
            onMcpToolsChange={setMcpTools}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* ── Header ── */}
        <ChatHeader
          lang={config.lang}
          model={config.model}
          customModels={config.customModels}
          planMode={planMode}
          running={activeLive?.running ?? false}
          activeToolCount={activeToolCount}
          mcpToolCount={mcpTools.length}
          tokenUsage={activeLive?.tokenUsage ?? { prompt: 0, completion: 0, total: 0 }}
          onModelChange={(id) => setConfig((c) => ({ ...c, model: id }))}
          onPlanModeToggle={setPlanMode}
          onOpenSettings={openSettings}
        />

        {/* ── Thread ── */}
        <ChatThread
          lang={config.lang}
          entries={activeLive?.entries ?? []}
          todos={activeLive?.todos ?? []}
          streaming={activeLive?.streaming ?? ""}
          running={activeLive?.running ?? false}
          skills={skills}
          suggestions={suggestions}
          editApproval={
            editApproval && editApproval.sessionId === active.id
              ? { proposal: editApproval.proposal, resolve: editApproval.resolve }
              : null
          }
          userQuestion={
            userQuestion && userQuestion.sessionId === active.id
              ? { q: userQuestion.q, resolve: userQuestion.resolve }
              : null
          }
          onSuggestionClick={(s) => void send(active.id, s)}
          onSkillClick={(name) => {
            const el = composerRef.current as HTMLTextAreaElement & { insertText?: (t: string) => void } | null;
            el?.insertText?.(`/${name} `);
          }}
        />

        {/* ── Composer ── */}
        <Composer
          lang={config.lang}
          model={config.model}
          planMode={planMode}
          running={activeLive?.running ?? false}
          skills={skills}
          onSend={(text, images) => void send(active.id, text, images)}
          onStop={() => stop(active.id)}
        />
      </div>
    </div>
  );
}
