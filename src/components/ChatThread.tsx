import React, { useEffect, useRef } from "react";
import type { ChatMessage } from "../types/workspace";
import { STRINGS, type Lang } from "../i18n";

export interface ChatThreadProps {
  lang: Lang;
  messages: ChatMessage[];
  streaming: string;
  running: boolean;
  onSuggestionClick?: (text: string) => void;
}

const SUGGESTIONS = [
  "Explain the project structure",
  "Find and fix TypeScript errors",
  "Write unit tests for this module",
  "Refactor for better readability",
];

function ToolCallCard({ line }: { line: string }) {
  const toolMatch = line.match(/^\[tool:([\w.-]+)\](.*)$/);
  const resultMatch = line.match(/^\[result(?::(ok|err))?\](.*)$/);

  if (toolMatch) {
    const [, name, args] = toolMatch;
    const icon: Record<string, string> = {
      readFile: "📄", writeFile: "✏️", shell: "💻", listFiles: "📂",
      searchFiles: "🔍", editFile: "🖊️", webSearch: "🌐",
    };
    return (
      <div className="tool-card anim-fade-up">
        <div className="tool-card-icon">{icon[name] ?? "🔧"}</div>
        <div className="tool-card-body">
          <div className="tool-card-name">{name}</div>
          {args.trim() && <div className="tool-card-arg">{args.trim()}</div>}
        </div>
      </div>
    );
  }

  if (resultMatch) {
    const [, status, content] = resultMatch;
    return (
      <div className={`tool-card-result ${status === "err" ? "err" : "ok"}`}>
        {content.trim()}
      </div>
    );
  }

  return null;
}

function MessageBubble({ msg, lang }: { msg: ChatMessage; lang: Lang }) {
  const isUser = msg.role === "user";
  const lines = msg.content.split("\n");

  const hasToolLines = lines.some(
    (l) => l.match(/^\[tool:/) ?? l.match(/^\[result/)
  );

  if (hasToolLines) {
    return (
      <div className="msg anim-fade-up" style={{ flexDirection: "column", gap: 4 }}>
        {lines.map((line, i) => {
          const card = <ToolCallCard key={i} line={line} />;
          if (card) return card;
          if (line.trim()) return (
            <div key={i} className="msg">
              <div className="msg-avatar msg-avatar-bot">◈</div>
              <div className="msg-bubble msg-bubble-bot">{line}</div>
            </div>
          );
          return null;
        })}
      </div>
    );
  }

  return (
    <div className={`msg anim-fade-up ${isUser ? "msg-user" : ""}`}>
      <div className={`msg-avatar ${isUser ? "msg-avatar-user" : "msg-avatar-bot"}`}>
        {isUser ? "Y" : "◈"}
      </div>
      <div className={`msg-bubble ${
        isUser ? "msg-bubble-user" : "msg-bubble-bot"
      } ${msg.role === "error" ? "msg-bubble-error" : ""}`}
        dir="auto"
      >
        {msg.content.split("\n").map((line, i) => (
          <React.Fragment key={i}>
            {line}
            {i < msg.content.split("\n").length - 1 && <br />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function ChatThread({ lang, messages, streaming, running, onSuggestionClick }: ChatThreadProps) {
  const t = STRINGS[lang];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  /* ── Welcome screen ── */
  if (messages.length === 0 && !streaming) {
    return (
      <div className="thread">
        <div className="welcome">
          <div className="welcome-logo">◈</div>
          <div className="welcome-title">iBot</div>
          <div className="welcome-subtitle">
            Your AI coding agent — powered by OpenRouter.<br />
            Ask anything, or pick a suggestion below.
          </div>
          <div className="suggestions">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s}
                className={`suggestion-card stagger-${i + 1}`}
                onClick={() => onSuggestionClick?.(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div ref={bottomRef} />
      </div>
    );
  }

  return (
    <div className="thread">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} lang={lang} />
      ))}

      {/* Streaming bubble */}
      {streaming && (
        <div className="msg anim-fade-up">
          <div className="msg-avatar msg-avatar-bot">◈</div>
          <div className="msg-bubble msg-bubble-streaming" dir="auto">
            {streaming}
            <span className="streaming-cursor" />
          </div>
        </div>
      )}

      {/* Thinking indicator */}
      {running && !streaming && (
        <div className="msg anim-fade-up">
          <div className="msg-avatar msg-avatar-bot">◈</div>
          <div className="msg-bubble msg-bubble-bot" style={{ display: "flex", gap: 4, alignItems: "center", padding: "12px 16px" }}>
            <span className="stream-dot" />
            <span className="stream-dot" />
            <span className="stream-dot" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
