import React, { useRef, useState, useEffect } from "react";
import type { Lang } from "../i18n";
import { STRINGS } from "../i18n";
import { TokenUsage, type TokenUsageData } from "../TokenUsage";

const MODELS = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { id: "openai/gpt-4.1",              label: "GPT-4.1" },
  { id: "google/gemini-2.5-pro",       label: "Gemini 2.5 Pro" },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1" },
  { id: "z-ai/glm-4.6",               label: "GLM 4.6" },
  { id: "qwen/qwen3-coder",            label: "Qwen3 Coder" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
];

export interface ChatHeaderProps {
  lang: Lang;
  model: string;
  customModels: string[];
  planMode: boolean;
  running: boolean;
  activeToolCount: number;
  mcpToolCount: number;
  tokenUsage: TokenUsageData;
  onModelChange: (id: string) => void;
  onPlanModeToggle: (v: boolean) => void;
  onOpenSettings: (tab?: "general" | "mcp" | "docker") => void;
}

export function ChatHeader({
  lang, model, customModels, planMode, running, activeToolCount,
  mcpToolCount, tokenUsage, onModelChange, onPlanModeToggle, onOpenSettings,
}: ChatHeaderProps) {
  const t = STRINGS[lang];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const allModels = [
    ...MODELS,
    ...customModels.map((id) => ({ id, label: id })),
  ];
  const modelLabel = allModels.find((m) => m.id === model)?.label ?? model;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <header className="chat-header">
      {/* Model picker */}
      <div className="model-picker" ref={menuRef}>
        <button className="model-btn" onClick={() => setMenuOpen((o) => !o)}>
          <span className="model-dot" />
          <span dir="ltr">{modelLabel}</span>
          <span className="chev-down">▾</span>
        </button>
        {menuOpen && (
          <div className="model-menu" dir="ltr">
            {allModels.map((m) => (
              <button key={m.id}
                className={m.id === model ? "active" : ""}
                onClick={() => { onModelChange(m.id); setMenuOpen(false); }}
              >{m.label}</button>
            ))}
            <div className="menu-divider" />
            <button className="menu-action"
              onClick={() => { setMenuOpen(false); onOpenSettings("general"); }}
            >⚙ Manage models…</button>
          </div>
        )}
      </div>

      {/* Plan mode toggle */}
      <label className="chip-toggle">
        <input type="checkbox" checked={planMode} onChange={(e) => onPlanModeToggle(e.target.checked)} />
        <span>📋 {t.planMode}</span>
      </label>

      {/* MCP badge */}
      {mcpToolCount > 0 && (
        <button className="chip-btn mcp-badge"
          title={`${mcpToolCount} MCP tools active`}
          onClick={() => onOpenSettings("mcp")}
        >🔌 {mcpToolCount}</button>
      )}

      <div className="spacer" />

      {/* Token usage */}
      {tokenUsage.total > 0 && <TokenUsage usage={tokenUsage} />}

      {/* Running indicator */}
      {running && (
        <span className="running-indicator">
          <span className="pulse-dot" /> {activeToolCount > 0 && activeToolCount}
        </span>
      )}
    </header>
  );
}
