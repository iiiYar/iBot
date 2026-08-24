import React, { useEffect, useRef, useState } from "react";
import type { SkillInfo } from "../agent";
import { STRINGS, type Lang } from "../i18n";

const SLASH_SHORTCUTS = [
  { name: "clear",   desc: "Clear chat history" },
  { name: "compact", desc: "Summarise & compress context" },
  { name: "plan",    desc: "Plan before executing" },
];

export interface ComposerProps {
  lang: Lang;
  running: boolean;
  skills: SkillInfo[];
  onSend: (msg: string) => void;
  onStop: () => void;
}

export function Composer({ lang, running, skills, onSend, onStop }: ComposerProps) {
  const t = STRINGS[lang];
  const [text, setText] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-resize */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  /* Focus on mount */
  useEffect(() => { taRef.current?.focus(); }, []);

  const allSlash = [
    ...SLASH_SHORTCUTS,
    ...skills.map((s) => ({ name: s.name, desc: s.description })),
  ];

  const slashMatches = text.startsWith("/")
    ? allSlash.filter((s) => s.name.startsWith(text.slice(1)))
    : [];

  useEffect(() => {
    setSlashOpen(slashMatches.length > 0 && text.startsWith("/"));
    setSlashIdx(0);
  }, [text]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    onSend(trimmed);
    setText("");
    if (taRef.current) {
      taRef.current.style.height = "auto";
    }
  }

  function pickSlash(name: string) {
    setText("/" + name + " ");
    setSlashOpen(false);
    taRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (slashOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => Math.min(i + 1, slashMatches.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSlashIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        if (slashMatches[slashIdx]) pickSlash(slashMatches[slashIdx].name);
        return;
      }
      if (e.key === "Escape") { setSlashOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const charCount = text.length;
  const canSend = text.trim().length > 0 && !running;

  return (
    <div className="composer-wrap" style={{ position: "relative" }}>
      {/* Slash menu */}
      {slashOpen && (
        <div className="slash-menu">
          {slashMatches.map((s, i) => (
            <div
              key={s.name}
              className={`slash-item ${i === slashIdx ? "focused" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pickSlash(s.name); }}
            >
              <span className="slash-item-name">/{s.name}</span>
              <span className="slash-item-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      )}

      <div className="composer">
        <textarea
          ref={taRef}
          className="composer-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={running ? t.thinking : t.inputPlaceholder}
          disabled={false}
          rows={1}
          dir="auto"
        />

        <div className="composer-actions">
          {/* Attachment btn (future) */}
          <button className="composer-action-btn" title="Attach file" disabled>
            📎
          </button>

          {/* Voice btn (future) */}
          <button className="composer-action-btn" title="Voice input" disabled>
            🎙
          </button>

          <div className="composer-spacer" />

          {/* Char counter */}
          <span className="composer-meta">
            {charCount > 0 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: .5 }}>
                {charCount}
              </span>
            )}
            <kbd>↵</kbd>
          </span>

          {/* Send / Stop */}
          {running ? (
            <button className="composer-send composer-stop" onClick={onStop} title={t.stop}>
              ■
            </button>
          ) : (
            <button
              className="composer-send"
              onClick={send}
              disabled={!canSend}
              title={`${t.send} (Enter)`}
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
