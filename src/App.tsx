import React, { useCallback, useRef, useState } from "react";
import "./styles.css";

import { Sidebar }        from "./components/Sidebar";
import { ChatHeader }     from "./components/ChatHeader";
import { ChatThread }     from "./components/ChatThread";
import { Composer }       from "./components/Composer";
import { SettingsModal }  from "./components/SettingsModal";
import { ActivityPanel, type ActivityItem } from "./components/ActivityPanel";
import { DiffOverlay }   from "./components/DiffOverlay";
import { AskUserModal }  from "./components/AskUserModal";

import {
  AgentRunner,
  type SkillInfo, type TodoItem,
  type EditProposal, type PendingQuestion,
} from "./agent";
import { STRINGS, type Lang } from "./i18n";
import { useWorkspace }       from "./hooks/useWorkspace";
import type { ChatMessage }   from "./types/workspace";

const DEFAULT_MODELS = [
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4",
  "stealth/ox-alpha",
];

type LiveSession = {
  running:       boolean;
  streaming:     string;
  todos:         TodoItem[];
  projectRoot:   string | null;
  history:       ChatMessage[];
  activityItems: ActivityItem[];
  tokenUsage:    { prompt: number; completion: number; cost: number } | null;
};

function makeLive(projectRoot: string | null = null): LiveSession {
  return { running: false, streaming: "", todos: [], projectRoot, history: [], activityItems: [], tokenUsage: null };
}

// PromiseResolver: lets us resolve/reject a promise from outside
type Resolver<T> = { resolve: (v: T) => void; reject: (e: unknown) => void };

export default function App() {
  /* ── Workspace ── */
  const {
    sessions, activeSessionId,
    createSession, setActiveSession,
    deleteSession, updateSession,
  } = useWorkspace();

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  /* ── Settings ── */
  const [model,        setModel]        = useState(() => localStorage.getItem("model")         || DEFAULT_MODELS[0]);
  const [apiKey,       setApiKey]       = useState(() => localStorage.getItem("openrouterKey") || "");
  const [maxTokens,    setMaxTokens]    = useState(() => Number(localStorage.getItem("maxTokens")) || 8192);
  const [planMode,     setPlanMode]     = useState(() => localStorage.getItem("planMode") === "true");
  const [autoApprove,  setAutoApprove]  = useState(() => localStorage.getItem("autoApprove") === "true");
  const [lang,         setLang]         = useState<Lang>(() => (localStorage.getItem("lang") as Lang) || "en");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState<"general" | "mcp" | "docker">("general");

  /* ── Live session state ── */
  const [liveSessions, setLiveSessions] = useState<Record<string, LiveSession>>({});

  /* ── Trust signal overlays ── */
  const [diffProposal,    setDiffProposal]    = useState<EditProposal | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const diffResolverRef   = useRef<Resolver<"approved" | "rejected"> | null>(null);
  const askResolverRef    = useRef<Resolver<string> | null>(null);

  /* ── Skills ── */
  const [skills,       setSkills]       = useState<SkillInfo[]>([]);
  const [mcpToolCount, setMcpToolCount] = useState(0);
  const [treeRefresh,  setTreeRefresh]  = useState(0);

  /* ── Runner refs ── */
  const runnersRef = useRef<Record<string, AgentRunner>>({});

  const t = STRINGS[lang];

  /* ── Helpers ── */
  const getLive = useCallback((id: string): LiveSession =>
    liveSessions[id] ?? makeLive(), [liveSessions]);

  const setLive = useCallback((id: string, patch: Partial<LiveSession>) => {
    setLiveSessions((prev) => ({ ...prev, [id]: { ...(prev[id] ?? makeLive()), ...patch } }));
  }, []);

  /* ── Diff gate ── */
  function requestDiffApproval(proposal: EditProposal): Promise<"approved" | "rejected"> {
    setDiffProposal(proposal);
    return new Promise((resolve, reject) => {
      diffResolverRef.current = { resolve, reject };
    });
  }

  function handleDiffApprove() {
    setDiffProposal(null);
    diffResolverRef.current?.resolve("approved");
    diffResolverRef.current = null;
  }

  function handleDiffReject() {
    setDiffProposal(null);
    diffResolverRef.current?.resolve("rejected");
    diffResolverRef.current = null;
  }

  /* ── Ask user gate ── */
  function requestAskUser(q: PendingQuestion): Promise<string> {
    setPendingQuestion(q);
    return new Promise((resolve, reject) => {
      askResolverRef.current = { resolve, reject };
    });
  }

  function handleAskAnswer(answer: string) {
    setPendingQuestion(null);
    askResolverRef.current?.resolve(answer);
    askResolverRef.current = null;
  }

  /* ── Runner factory (creates new runner per send with correct hooks) ── */
  function buildRunner(sessionId: string, currentHistory: ChatMessage[]): AgentRunner {
    const live = getLive(sessionId);

    // Convert ChatMessage[] → AgentMessage[]
    const agentHistory = currentHistory.map((m) => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
      id:      m.id,
      createdAt: m.createdAt,
    }));

    return new AgentRunner(
      { apiKey, model },
      live.projectRoot,
      planMode,
      autoApprove,
      {
        onAssistantDelta: (chunk) => {
          setLiveSessions((prev) => ({
            ...prev,
            [sessionId]: { ...(prev[sessionId] ?? makeLive()), streaming: chunk },
          }));
        },
        onAssistantMessage: (text) => {
          const msg: ChatMessage = {
            id: crypto.randomUUID(), role: "assistant",
            content: text, createdAt: new Date().toISOString(),
          };
          setLiveSessions((prev) => {
            const s = prev[sessionId] ?? makeLive();
            return { ...prev, [sessionId]: { ...s, history: [...s.history, msg], streaming: "" } };
          });
        },
        onToolCall: (name, arg) => {
          const item: ActivityItem = {
            id:     crypto.randomUUID(),
            type:   name.includes("File") || name === "Read" || name === "Edit" ? "file"
                  : name === "Shell" ? "shell"
                  : name.startsWith("Web") ? "web" : "tool",
            name, arg: arg.slice(0, 120),
            status: "running", ts: Date.now(),
          };
          setLiveSessions((prev) => {
            const s = prev[sessionId] ?? makeLive();
            return { ...prev, [sessionId]: { ...s, activityItems: [...s.activityItems, item] } };
          });
        },
        onToolResult: (name, _arg, result) => {
          const ok = !result.startsWith("Tool error") && !result.startsWith("USER_REJECTED");
          setLiveSessions((prev) => {
            const s = prev[sessionId] ?? makeLive();
            const items = s.activityItems.map((i) =>
              i.name === name && i.status === "running"
                ? { ...i, status: ok ? "ok" as const : "err" as const, result: result.slice(0, 400) }
                : i
            );
            return { ...prev, [sessionId]: { ...s, activityItems: items } };
          });
          setTreeRefresh((n) => n + 1);
        },
        onTodos: (todos) => {
          setLiveSessions((prev) => ({
            ...prev,
            [sessionId]: { ...(prev[sessionId] ?? makeLive()), todos },
          }));
        },
        onEditProposal: (_p) => { /* visual handled by waitForEditApproval */ },
        waitForEditApproval: requestDiffApproval,
        askUser:             requestAskUser,
        shouldContinue: () => !!(runnersRef.current[sessionId]),
        onTokenUsage: (usage) => {
          setLiveSessions((prev) => ({
            ...prev,
            [sessionId]: {
              ...(prev[sessionId] ?? makeLive()),
              tokenUsage: { prompt: usage.prompt, completion: usage.completion, cost: 0 },
            },
          }));
        },
      },
      agentHistory,
      skills,
    );
  }

  /* ── Send ── */
  async function handleSend(text: string) {
    if (!activeSessionId) return;
    if (getLive(activeSessionId).running) return;

    // Slash commands
    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.slice(1).split(" ");
      if (cmd === "clear") {
        setLive(activeSessionId, { history: [], streaming: "", todos: [], activityItems: [] });
        return;
      }
      const skill = skills.find((s) => s.name === cmd);
      if (skill) text = `Use skill "${skill.name}": ${skill.description}\n${rest.join(" ")}`;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user",
      content: text, createdAt: new Date().toISOString(),
    };

    const prevHistory = getLive(activeSessionId).history;
    const nextHistory = [...prevHistory, userMsg];

    setLive(activeSessionId, { history: nextHistory, running: true, streaming: "" });

    if (!activeSession?.title) {
      updateSession(activeSessionId, { title: text.slice(0, 40) });
    }

    const runner = buildRunner(activeSessionId, nextHistory);
    runnersRef.current[activeSessionId] = runner;
    runner.addUserTurn(text);

    try {
      await runner.run();
    } finally {
      const finalHistory = runner.getHistory()
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id:        (m as { id?: string }).id ?? crypto.randomUUID(),
          role:      m.role as ChatMessage["role"],
          content:   typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          createdAt: (m as { createdAt?: string }).createdAt ?? new Date().toISOString(),
        }));

      setLive(activeSessionId, { running: false, streaming: "", history: finalHistory });
      updateSession(activeSessionId, { messages: finalHistory });
      delete runnersRef.current[activeSessionId];
    }
  }

  /* ── Stop ── */
  function handleStop() {
    if (!activeSessionId) return;
    runnersRef.current[activeSessionId]?.stop();
    delete runnersRef.current[activeSessionId];
    setLive(activeSessionId, { running: false, streaming: "" });
    // Also dismiss any pending gate
    diffResolverRef.current?.resolve("rejected"); diffResolverRef.current = null; setDiffProposal(null);
    askResolverRef.current?.resolve("Skip");       askResolverRef.current  = null; setPendingQuestion(null);
  }

  /* ── New session ── */
  function handleNewSession() {
    const root = getLive(activeSessionId).projectRoot;
    const id   = createSession();
    setLive(id, makeLive(root));
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
    setApiKey(newKey);       localStorage.setItem("openrouterKey", newKey);
    setModel(newModel);      localStorage.setItem("model",         newModel);
    setMaxTokens(newMaxTok); localStorage.setItem("maxTokens",     String(newMaxTok));
    setPlanMode(newPlan);    localStorage.setItem("planMode",      String(newPlan));
  }

  const live = getLive(activeSessionId);
  const hasActivity = live.activityItems.length > 0 || live.todos.length > 0 || !!live.tokenUsage;

  const getLiveForSidebar = useCallback((id: string) => {
    const l = getLive(id);
    return { running: l.running, todos: l.todos, projectRoot: l.projectRoot };
  }, [getLive]);

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
        onSwitchSession={setActiveSession}
        onDeleteSession={deleteSession}
        onOpenSettings={(tab) => { setSettingsTab(tab ?? "general"); setSettingsOpen(true); }}
        onSkillClick={() => {}}
        onLangToggle={() => {
          const next = lang === "en" ? "ar" : "en";
          setLang(next); localStorage.setItem("lang", next);
        }}
      />

      {/* ── Main ── */}
      <main className="main">
        <ChatHeader
          lang={lang} model={model}
          projectRoot={live.projectRoot}
          running={live.running} planMode={planMode}
          tokenUsage={live.tokenUsage}
          onTogglePlanMode={() => {
            const n = !planMode; setPlanMode(n); localStorage.setItem("planMode", String(n));
          }}
          onOpenSettings={(tab) => { setSettingsTab(tab ?? "general"); setSettingsOpen(true); }}
          onPickFolder={handlePickFolder}
          onStop={handleStop}
        />
        <ChatThread
          lang={lang} messages={live.history}
          streaming={live.streaming} running={live.running}
          onSuggestionClick={handleSend}
        />
        <Composer
          lang={lang} running={live.running}
          skills={skills} onSend={handleSend} onStop={handleStop}
        />
      </main>

      {/* ── Activity Panel ── */}
      {hasActivity && (
        <ActivityPanel
          items={live.activityItems} todos={live.todos}
          tokenUsage={live.tokenUsage} contextLimit={maxTokens}
        />
      )}

      {/* ── Trust signal overlays ── */}
      <DiffOverlay
        proposal={diffProposal}
        onApprove={handleDiffApprove}
        onReject={handleDiffReject}
      />
      <AskUserModal
        question={pendingQuestion}
        onAnswer={handleAskAnswer}
      />

      {/* ── Settings ── */}
      <SettingsModal
        lang={lang} open={settingsOpen}
        initialTab={settingsTab} model={model}
        openrouterKey={apiKey} planMode={planMode}
        maxTokens={maxTokens}
        onClose={() => setSettingsOpen(false)}
        onSaveGeneral={handleSaveGeneral}
      />
    </div>
  );
}
