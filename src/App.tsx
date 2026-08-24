import React, { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";

import { Sidebar } from "./components/Sidebar";
import { ChatHeader } from "./components/ChatHeader";
import { ChatThread } from "./components/ChatThread";
import { Composer } from "./components/Composer";
import { SettingsModal } from "./components/SettingsModal";
import { ActivityPanel, type ActivityItem } from "./components/ActivityPanel";

import { AgentRunner, type SkillInfo, type TodoItem } from "./agent";
import { STRINGS, type Lang } from "./i18n";
import { useWorkspace } from "./hooks/useWorkspace";
import type { ChatMessage } from "./types/workspace";

const DEFAULT_MODELS = [
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4",
  "stealth/ox-alpha",
];

function toChatMessages(
  msgs: import("./agent").AgentMessage[]
): ChatMessage[] {
  return msgs.map((m) => ({
    id:        m.id        ?? crypto.randomUUID(),
    role:      m.role      as ChatMessage["role"],
    content:   m.content,
    createdAt: m.createdAt ?? new Date().toISOString(),
  }));
}

type LiveSession = {
  running:     boolean;
  streaming:   string;
  todos:       TodoItem[];
  projectRoot: string | null;
  history:     ChatMessage[];
  activityItems: ActivityItem[];
  tokenUsage:  { prompt: number; completion: number; cost: number } | null;
};

function makeLive(projectRoot?: string | null): LiveSession {
  return {
    running: false, streaming: "",
    todos: [], projectRoot: projectRoot ?? null,
    history: [], activityItems: [],
    tokenUsage: null,
  };
}

export default function App() {
  /* ── Workspace ── */
  const {
    projects, activeProjectId,
    sessions, activeSessionId,
    createProject, setActiveProject,
    createSession,  setActiveSession,
    deleteSession,  updateSession,
  } = useWorkspace();

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  /* ── Settings ── */
  const [model,        setModel]        = useState(() => localStorage.getItem("model")        || DEFAULT_MODELS[0]);
  const [apiKey,       setApiKey]       = useState(() => localStorage.getItem("openrouterKey") || "");
  const [maxTokens,    setMaxTokens]    = useState(() => Number(localStorage.getItem("maxTokens")) || 8192);
  const [planMode,     setPlanMode]     = useState(() => localStorage.getItem("planMode") === "true");
  const [lang,         setLang]         = useState<Lang>(() => (localStorage.getItem("lang") as Lang) || "en");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState<"general" | "mcp" | "docker">("general");

  /* ── Live state ── */
  const [liveSessions, setLiveSessions] = useState<Record<string, LiveSession>>({});

  /* ── Skills ── */
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [mcpToolCount, setMcpToolCount] = useState(0);

  /* ── Tree refresh ── */
  const [treeRefresh, setTreeRefresh] = useState(0);

  const t = STRINGS[lang];

  /* ── Runner refs ── */
  const runnersRef = useRef<Record<string, AgentRunner>>({});

  /* ── Helpers ── */
  const getLive = useCallback((id: string): LiveSession => {
    return liveSessions[id] ?? makeLive();
  }, [liveSessions]);

  const setLive = useCallback((id: string, patch: Partial<LiveSession>) => {
    setLiveSessions((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? makeLive()), ...patch },
    }));
  }, []);

  /* ── Load skills on project change ── */
  const projectRoot = getLive(activeSessionId).projectRoot
    ?? sessions.find((s) => s.id === activeSessionId)?.title
    ?? null;

  useEffect(() => {
    const root = getLive(activeSessionId).projectRoot;
    if (!root) return;
    window.botyar.listSkills(root)
      .then(setSkills)
      .catch(() => setSkills([]));
  }, [activeSessionId, getLive]);

  /* ── Runner factory ── */
  function getRunner(sessionId: string): AgentRunner {
    if (!runnersRef.current[sessionId]) {
      runnersRef.current[sessionId] = new AgentRunner();
    }
    return runnersRef.current[sessionId];
  }

  /* ── Send message ── */
  async function handleSend(text: string) {
    if (!activeSessionId) return;
    if (getLive(activeSessionId).running) return;

    // Skill shortcut
    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.slice(1).split(" ");
      if (cmd === "clear") {
        setLive(activeSessionId, { history: [], streaming: "", todos: [], activityItems: [] });
        return;
      }
      const skill = skills.find((s) => s.name === cmd);
      if (skill) {
        text = `Use skill "${skill.name}": ${skill.description}\n${rest.join(" ")}`;
      }
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user",
      content: text, createdAt: new Date().toISOString(),
    };

    setLive(activeSessionId, {
      history:   [...(getLive(activeSessionId).history ?? []), userMsg],
      running:   true,
      streaming: "",
    });

    // Auto-title first message
    if (!activeSession?.title) {
      updateSession(activeSessionId, { title: text.slice(0, 40) });
    }

    const runner = getRunner(activeSessionId);
    const live   = getLive(activeSessionId);

    try {
      await runner.run({
        messages:    toChatMessages(runner.getHistory()),
        userMessage: text,
        model,
        apiKey,
        maxTokens,
        planMode,
        projectRoot: live.projectRoot ?? undefined,
        skills,
        onStream: (chunk) => {
          setLive(activeSessionId, { streaming: chunk });
        },
        onTodos: (todos) => {
          setLive(activeSessionId, { todos });
        },
        onToolCall: (name, arg) => {
          const item: ActivityItem = {
            id:     crypto.randomUUID(),
            type:   name.includes("File") ? "file" : name === "shell" ? "shell" : name.startsWith("web") ? "web" : "tool",
            name,
            arg:    typeof arg === "string" ? arg : JSON.stringify(arg).slice(0, 120),
            status: "running",
            ts:     Date.now(),
          };
          setLive(activeSessionId, {
            activityItems: [...(getLive(activeSessionId).activityItems ?? []), item],
          });
        },
        onToolResult: (name, result, ok) => {
          setLive(activeSessionId, {
            activityItems: (getLive(activeSessionId).activityItems ?? []).map((i) =>
              i.name === name && i.status === "running"
                ? { ...i, status: ok ? "ok" : "err", result: String(result).slice(0, 400) }
                : i
            ),
          });
          setTreeRefresh((n) => n + 1);
        },
        onTokenUsage: (usage) => {
          setLive(activeSessionId, { tokenUsage: usage });
        },
      });
    } finally {
      const history = toChatMessages(runner.getHistory());
      setLive(activeSessionId, { running: false, streaming: "", history });
      updateSession(activeSessionId, { messages: history });
    }
  }

  /* ── Stop ── */
  function handleStop() {
    if (!activeSessionId) return;
    runnersRef.current[activeSessionId]?.stop();
    setLive(activeSessionId, { running: false, streaming: "" });
  }

  /* ── New session ── */
  function handleNewSession() {
    const id = createSession();
    setLive(id, makeLive(projectRoot));
  }

  /* ── Pick folder ── */
  async function handlePickFolder() {
    const dir = await window.botyar.pickFolder();
    if (!dir) return;
    setLive(activeSessionId, { projectRoot: dir });
    const sk = await window.botyar.listSkills(dir).catch(() => []);
    setSkills(sk);
    setTreeRefresh((n) => n + 1);
  }

  /* ── Settings save ── */
  function handleSaveGeneral(newKey: string, newModel: string, newMaxTok: number, newPlan: boolean) {
    setApiKey(newKey);   localStorage.setItem("openrouterKey", newKey);
    setModel(newModel);  localStorage.setItem("model",         newModel);
    setMaxTokens(newMaxTok); localStorage.setItem("maxTokens",  String(newMaxTok));
    setPlanMode(newPlan); localStorage.setItem("planMode",     String(newPlan));
  }

  const live = getLive(activeSessionId);

  const getLiveForSidebar = useCallback((id: string) => {
    const l = getLive(id);
    return { running: l.running, todos: l.todos, projectRoot: l.projectRoot };
  }, [getLive]);

  const hasActivity = live.activityItems.length > 0 || live.todos.length > 0 || !!live.tokenUsage;

  return (
    <div className={`app ${hasActivity ? "" : "no-activity"}`}>

      {/* ── Sidebar ── */}
      <Sidebar
        lang={lang}
        projectRoot={live.projectRoot}
        sessions={sessions}
        activeSessionId={activeSessionId}
        getLiveSession={getLiveForSidebar}
        skills={skills}
        treeRefresh={treeRefresh}
        mcpToolCount={mcpToolCount}
        onNewSession={handleNewSession}
        onPickFolder={handlePickFolder}
        onSwitchSession={(id) => { setActiveSession(id); }}
        onDeleteSession={deleteSession}
        onOpenSettings={(tab) => { setSettingsTab(tab ?? "general"); setSettingsOpen(true); }}
        onSkillClick={(name) => { /* insert slash cmd into composer */ }}
        onLangToggle={() => {
          const next = lang === "en" ? "ar" : "en";
          setLang(next); localStorage.setItem("lang", next);
        }}
      />

      {/* ── Main column ── */}
      <main className="main">
        <ChatHeader
          lang={lang}
          model={model}
          projectRoot={live.projectRoot}
          running={live.running}
          planMode={planMode}
          tokenUsage={live.tokenUsage}
          onTogglePlanMode={() => {
            const next = !planMode;
            setPlanMode(next); localStorage.setItem("planMode", String(next));
          }}
          onOpenSettings={(tab) => { setSettingsTab(tab ?? "general"); setSettingsOpen(true); }}
          onPickFolder={handlePickFolder}
          onStop={handleStop}
        />

        <ChatThread
          lang={lang}
          messages={live.history}
          streaming={live.streaming}
          running={live.running}
          onSuggestionClick={handleSend}
        />

        <Composer
          lang={lang}
          running={live.running}
          skills={skills}
          onSend={handleSend}
          onStop={handleStop}
        />
      </main>

      {/* ── Activity Panel ── */}
      {hasActivity && (
        <ActivityPanel
          items={live.activityItems}
          todos={live.todos}
          tokenUsage={live.tokenUsage}
          contextLimit={maxTokens}
        />
      )}

      {/* ── Settings modal ── */}
      <SettingsModal
        lang={lang}
        open={settingsOpen}
        initialTab={settingsTab}
        model={model}
        openrouterKey={apiKey}
        planMode={planMode}
        maxTokens={maxTokens}
        onClose={() => setSettingsOpen(false)}
        onSaveGeneral={handleSaveGeneral}
      />
    </div>
  );
}
