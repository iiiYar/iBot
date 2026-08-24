import type { Lang } from "../i18n";
import { STRINGS } from "../i18n";

export interface ChatHeaderProps {
  lang: Lang;
  model: string;
  projectRoot: string | null;
  running: boolean;
  planMode: boolean;
  tokenUsage: { prompt: number; completion: number; cost: number } | null;
  onTogglePlanMode: () => void;
  onOpenSettings: (tab?: "general" | "mcp" | "docker") => void;
  onPickFolder: () => void;
  onStop: () => void;
}

export function ChatHeader({
  lang, model, projectRoot, running, planMode,
  tokenUsage, onTogglePlanMode, onOpenSettings, onPickFolder, onStop,
}: ChatHeaderProps) {
  const t = STRINGS[lang];
  const modelShort = model.split("/").pop()?.replace(/-\d{4,}.*/, "") ?? model;

  return (
    <header className="chat-header">
      {/* Model pill */}
      <button className="model-pill" onClick={() => onOpenSettings("general")} title={model}>
        <span className="model-pill-dot" />
        {modelShort}
        <span style={{ opacity: .5, fontSize: 10 }}>▾</span>
      </button>

      <div className="header-sep" />

      {/* Plan mode toggle */}
      <button
        className={`plan-toggle ${planMode ? "active" : ""}`}
        onClick={onTogglePlanMode}
        title="Plan mode: agent plans before executing"
      >
        <span>{planMode ? "⚡" : "📋"}</span>
        Plan
      </button>

      {/* Project folder badge */}
      <button className="header-badge" onClick={onPickFolder} title={projectRoot ?? t.pickFolder}>
        <span>📁</span>
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {projectRoot ? projectRoot.split(/[\\/]/).pop() : t.noFolder}
        </span>
      </button>

      <div className="header-spacer" />

      {/* Token badge */}
      {tokenUsage && (
        <div className="header-badge" title={`Prompt: ${tokenUsage.prompt} | Completion: ${tokenUsage.completion}`}>
          <span>◎</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {(tokenUsage.prompt + tokenUsage.completion).toLocaleString()}
          </span>
          {tokenUsage.cost > 0 && (
            <span style={{ opacity: .6 }}>${tokenUsage.cost.toFixed(4)}</span>
          )}
        </div>
      )}

      <div className="header-sep" />

      {/* Stop button (only when running) */}
      {running ? (
        <button className="btn danger sm" onClick={onStop} title={t.stop}>
          ■ {t.stop}
        </button>
      ) : (
        <button className="btn sm" onClick={() => onOpenSettings("general")} title={t.settings}>
          ⚙ Settings
        </button>
      )}
    </header>
  );
}
