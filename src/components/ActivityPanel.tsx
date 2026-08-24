import type { TodoItem } from "../agent";

export interface ActivityItem {
  id: string;
  type: "tool" | "file" | "shell" | "web";
  name: string;
  arg?: string;
  status: "running" | "ok" | "err";
  result?: string;
  ts: number;
}

export interface ActivityPanelProps {
  items: ActivityItem[];
  todos: TodoItem[];
  tokenUsage: { prompt: number; completion: number; cost: number } | null;
  contextLimit: number;
}

const ICON: Record<ActivityItem["type"], string> = {
  tool:  "🔧",
  file:  "📄",
  shell: "💻",
  web:   "🌐",
};

const TYPE_ICON: Record<string, string> = {
  readFile: "📄", writeFile: "✏️", editFile: "🖊️",
  shell: "💻", listFiles: "📂", searchFiles: "🔍",
  webSearch: "🌐", mcp: "🔌",
};

export function ActivityPanel({ items, todos, tokenUsage, contextLimit }: ActivityPanelProps) {
  const promptPct  = tokenUsage ? Math.min((tokenUsage.prompt     / contextLimit) * 100, 100) : 0;
  const completePct= tokenUsage ? Math.min((tokenUsage.completion / contextLimit) * 100, 100) : 0;

  const activeTodo = todos.find((t) => t.status === "in_progress");
  const doneTodos  = todos.filter((t) => t.status === "completed").length;

  return (
    <aside className="activity-panel">
      <div className="activity-panel-header">
        <span style={{ fontSize: 14 }}>⚡</span>
        <span className="activity-panel-title">Activity</span>
        {activeTodo && <span className="dot-running" style={{ marginLeft: "auto" }} />}
      </div>

      <div className="activity-panel-body">

        {/* ── Token meter ── */}
        {tokenUsage && (
          <div className="token-meter">
            <div className="token-meter-label">Context</div>
            <div className="token-bar-row">
              <span className="token-bar-label">Prompt</span>
              <div className="token-bar-track">
                <div className="token-bar-fill prompt" style={{ width: `${promptPct}%` }} />
              </div>
              <span className="token-bar-val">{(tokenUsage.prompt / 1000).toFixed(1)}k</span>
            </div>
            <div className="token-bar-row">
              <span className="token-bar-label">Output</span>
              <div className="token-bar-track">
                <div className="token-bar-fill completion" style={{ width: `${completePct}%` }} />
              </div>
              <span className="token-bar-val">{(tokenUsage.completion / 1000).toFixed(1)}k</span>
            </div>
            {tokenUsage.cost > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                Cost: <span style={{ color: "var(--text-secondary)" }}>${tokenUsage.cost.toFixed(5)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Plan / Todos ── */}
        {todos.length > 0 && (
          <div className="activity-item">
            <div className="activity-item-header">
              <span className="activity-item-name">📋 Plan</span>
              <span className="activity-item-status status-ok">{doneTodos}/{todos.length}</span>
            </div>
            <div className="todo-list">
              {todos.map((td) => (
                <div key={td.id} className={`todo-item ${td.status}`}>
                  <span className={`todo-dot ${td.status}`} />
                  <span className={`todo-text ${td.status}`}>{td.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tool call history ── */}
        {items.length > 0 && (
          <>
            <div style={{
              fontSize: "var(--text-2xs)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "var(--tracking-widest)",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              padding: "4px 2px",
            }}>Tool calls</div>
            {[...items].reverse().slice(0, 20).map((item) => (
              <div key={item.id} className="activity-item">
                <div className="activity-item-header">
                  <span style={{ fontSize: 14 }}>{TYPE_ICON[item.name] ?? ICON[item.type]}</span>
                  <span className="activity-item-name">{item.name}</span>
                  <span className={`activity-item-status status-${item.status}`}>
                    {item.status === "running" ? "…" : item.status === "ok" ? "✓" : "✗"}
                  </span>
                </div>
                {item.arg && (
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginTop: 2,
                  }}>{item.arg}</div>
                )}
                {item.result && item.status !== "running" && (
                  <div className={`tool-card-result ${item.status}`} style={{ marginTop: 6 }}>
                    {item.result.slice(0, 200)}{item.result.length > 200 ? "…" : ""}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {items.length === 0 && todos.length === 0 && !tokenUsage && (
          <div className="empty-state">
            <span style={{ fontSize: 28, opacity: .3 }}>⚡</span>
            <span>Activity appears here<br />when the agent runs</span>
          </div>
        )}
      </div>
    </aside>
  );
}
