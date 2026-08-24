import React, { useEffect, useRef } from "react";
import { TranscriptCardFrame } from "../sand/TranscriptCardFrame";
import type { EditProposal, PendingQuestion, TodoItem } from "../agent";
import type { Lang } from "../i18n";
import { STRINGS } from "../i18n";

// ── Types ──────────────────────────────────────────────────────────────
export type ChatEntry =
  | { kind: "user";      text: string; images?: string[] }
  | { kind: "assistant"; text: string }
  | { kind: "tool";      name: string; args: string; result: string }
  | { kind: "edit";      proposal: EditProposal; approved: boolean }
  | { kind: "error";     text: string };

const TOOL_ICONS: Record<string, string> = {
  Read: "📄", LS: "📂", Glob: "🔍", Grep: "🔎", Edit: "✏️",
  Shell: "⚡", WebSearch: "🌐", WebFetch: "🔗",
  update_todos: "☑️", ask_user: "❓",
};

// ── Helpers ────────────────────────────────────────────────────────────
function renderInline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4)
      return <b key={i}>{renderInline(seg.slice(2, -2))}</b>;
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2)
      return <code key={i} className="inline-code" dir="auto">{seg.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });
}

function renderTextBlock(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let list: string[] = []; let ordered = false; let key = 0;
  const flushList = () => {
    if (!list.length) return;
    const items = list; const isOrdered = ordered;
    out.push(isOrdered
      ? <ol key={`l${key++}`}>{items.map((it, i) => <li key={i} dir="auto">{renderInline(it)}</li>)}</ol>
      : <ul key={`l${key++}`}>{items.map((it, i) => <li key={i} dir="auto">{renderInline(it)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)/.exec(line);
    if (heading) { flushList(); out.push(<div key={`h${key++}`} className={`md-h h${heading[1].length}`} dir="auto">{renderInline(heading[2])}</div>); continue; }
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

export function renderMarkdown(text: string) {
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

export function lineDiff(before: string, after: string) {
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

// ── Sub-cards ──────────────────────────────────────────────────────────
function ToolCard({ name, args, result, icon }: { name: string; args: string; result: string; icon: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <TranscriptCardFrame variant="file" className="tool-frame">
      <button className="tool-summary" onClick={() => setOpen((o) => !o)}>
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{name}</span>
        {result !== "" ? <span className="tool-status done">✓</span> : <span className="tool-status spinner" />}
      </button>
      {open && args   && <pre className="tool-args"   dir="ltr">{args}</pre>}
      {open && result && <pre className="tool-result" dir="ltr">{result}</pre>}
    </TranscriptCardFrame>
  );
}

function EditCard({ proposal, diff }: { proposal: EditProposal; diff: Array<{ type: "same" | "add" | "del"; text: string }> }) {
  const [open, setOpen] = React.useState(true);
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

function QuestionCard({
  question, options, onAnswer, sendLabel,
}: {
  question: PendingQuestion; options: string[];
  onAnswer: (a: string) => void; sendLabel: string;
}) {
  const [answer, setAnswer] = React.useState("");
  return (
    <TranscriptCardFrame variant="question" className="question-frame">
      <div className="question-inner">
        <div className="question-text" dir="auto">{question.question}</div>
        {options.length > 0 ? (
          <div className="question-options">
            {options.map((opt, i) => (
              <button key={i} className="btn option" onClick={() => onAnswer(opt)}>{opt}</button>
            ))}
          </div>
        ) : (
          <div className="question-free">
            <input value={answer} autoFocus placeholder="…"
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && answer.trim()) onAnswer(answer.trim()); }} />
            <button className="btn primary sm" disabled={!answer.trim()}
              onClick={() => onAnswer(answer.trim())}>{sendLabel}</button>
          </div>
        )}
      </div>
    </TranscriptCardFrame>
  );
}

// ── Main Component ─────────────────────────────────────────────────────
export interface ChatThreadProps {
  lang: Lang;
  entries: ChatEntry[];
  todos: TodoItem[];
  streaming: string;
  running: boolean;
  skills: Array<{ name: string; path: string; description: string }>;
  suggestions: string[];
  editApproval: { proposal: EditProposal; resolve: (d: "approved" | "rejected") => void } | null;
  userQuestion: { q: PendingQuestion; resolve: (a: string) => void } | null;
  onSuggestionClick: (s: string) => void;
  onSkillClick: (name: string) => void;
}

export function ChatThread({
  lang, entries, todos, streaming, running, skills, suggestions,
  editApproval, userQuestion, onSuggestionClick, onSkillClick,
}: ChatThreadProps) {
  const t = STRINGS[lang];
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on every new entry / streaming update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, streaming]);

  if (entries.length === 0 && !streaming) {
    return (
      <main className="chat">
        <div className="welcome">
          <div className="welcome-logo">◈</div>
          <h1>{t.welcomeTitle}</h1>
          <p>{t.welcomeSub}</p>
          <div className="suggestions">
            {suggestions.map((s, i) => (
              <button key={i} className="suggestion-card" onClick={() => onSuggestionClick(s)}>
                <span>{s}</span><span className="arrow">→</span>
              </button>
            ))}
          </div>
          {skills.length > 0 && (
            <div className="skills-hint">
              {skills.map((s) => (
                <button key={s.path} className="skill-chip"
                  onClick={() => onSkillClick(s.name)}>/{s.name}</button>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="chat">
      <div className="thread">
        {entries.map((entry, i) => {
          if (entry.kind === "user")
            return (
              <div key={i} className="msg user">
                <div className="user-bubble" dir="auto">
                  {entry.text}
                  {entry.images && entry.images.length > 0 && (
                    <div className="bubble-images">
                      {entry.images.map((src, j) => <img key={j} src={src} alt="" />)}
                    </div>
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
          return (
            <div key={i} className="msg">
              <ToolCard name={entry.name} args={entry.args} result={entry.result}
                icon={TOOL_ICONS[entry.name] ?? "🔧"} />
            </div>
          );
        })}

        {/* Todos in-thread */}
        {todos.length > 0 && (
          <div className="msg">
            <div className="todos-card">
              {todos.map((td) => (
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

        {/* Edit approval bar */}
        {editApproval && (
          <div className="approval-bar">
            <span>{t.approveEdit} <b dir="ltr">{editApproval.proposal.path}</b>؟</span>
            <button className="btn primary sm" onClick={() => editApproval.resolve("approved")}>✓</button>
            <button className="btn danger sm"  onClick={() => editApproval.resolve("rejected")}>✕</button>
          </div>
        )}

        {/* User question */}
        {userQuestion && (
          <div className="msg">
            <QuestionCard question={userQuestion.q} options={userQuestion.q.options}
              sendLabel={t.send} onAnswer={(a) => userQuestion.resolve(a)} />
          </div>
        )}

        {/* Streaming */}
        {streaming && (
          <div className="msg assistant">
            <div className="md streaming">{renderMarkdown(streaming)}</div>
          </div>
        )}
        {running && !streaming && <div className="thinking"><span /><span /><span /></div>}
        <div ref={bottomRef} />
      </div>
    </main>
  );
}
