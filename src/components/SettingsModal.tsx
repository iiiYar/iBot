import React, { useState } from "react";
import type { Lang } from "../i18n";
import { STRINGS } from "../i18n";
import { McpSettings } from "../McpSettings";
import { DockerPanel } from "../DockerPanel";

const MODELS = [
  { id: "openai/gpt-4o",            label: "GPT-4o" },
  { id: "openai/gpt-4o-mini",       label: "GPT-4o Mini" },
  { id: "anthropic/claude-sonnet-4",label: "Claude Sonnet 4" },
  { id: "anthropic/claude-haiku-4-5",label: "Claude Haiku 4.5" },
  { id: "google/gemini-2.5-flash",  label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-pro",    label: "Gemini 2.5 Pro" },
  { id: "x-ai/grok-3-mini",         label: "Grok 3 Mini" },
  { id: "x-ai/grok-3",              label: "Grok 3" },
  { id: "deepseek/deepseek-r2",     label: "DeepSeek R2" },
  { id: "stealth/ox-alpha",         label: "Ox Alpha (Stealth)" },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
];

export interface SettingsModalProps {
  lang: Lang;
  open: boolean;
  initialTab?: "general" | "mcp" | "docker";
  model: string;
  openrouterKey: string;
  planMode: boolean;
  maxTokens: number;
  onClose: () => void;
  onSaveGeneral: (key: string, model: string, maxTokens: number, planMode: boolean) => void;
}

export function SettingsModal({
  lang, open, initialTab = "general",
  model, openrouterKey, planMode, maxTokens,
  onClose, onSaveGeneral,
}: SettingsModalProps) {
  const t = STRINGS[lang];
  const [tab, setTab] = useState<"general" | "mcp" | "docker">(initialTab);
  const [key, setKey] = useState(openrouterKey);
  const [selectedModel, setSelectedModel] = useState(model);
  const [customModel, setCustomModel] = useState("");
  const [maxTok, setMaxTok] = useState(maxTokens);
  const [localPlan, setLocalPlan] = useState(planMode);
  const [showKey, setShowKey] = useState(false);

  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      setKey(openrouterKey);
      setSelectedModel(model);
      setMaxTok(maxTokens);
      setLocalPlan(planMode);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const effectiveModel = customModel.trim() || selectedModel;

  const TABS = [
    { id: "general", label: "⚙ General",  icon: "⚙" },
    { id: "mcp",     label: "🔌 MCP",      icon: "🔌" },
    { id: "docker",  label: "🐳 Docker",   icon: "🐳" },
  ] as const;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal anim-scale-in">
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              className={`modal-tab ${tab === tb.id ? "active" : ""}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="modal-body">

          {tab === "general" && (
            <>
              {/* API Key */}
              <div className="field">
                <label className="field-label">OpenRouter API Key</label>
                <div className="input-row">
                  <input
                    className="input mono"
                    type={showKey ? "text" : "password"}
                    placeholder="sk-or-..."
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoComplete="off"
                  />
                  <button className="btn icon sm" onClick={() => setShowKey((v) => !v)} title="Toggle visibility">
                    {showKey ? "🙈" : "👁"}
                  </button>
                </div>
                <span className="field-hint">Get your key at openrouter.ai/keys</span>
              </div>

              {/* Model selector */}
              <div className="field">
                <label className="field-label">Model</label>
                <select
                  className="input"
                  value={selectedModel}
                  onChange={(e) => { setSelectedModel(e.target.value); setCustomModel(""); }}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Custom model */}
              <div className="field">
                <label className="field-label">Custom model ID <span style={{ opacity: .5 }}>(overrides above)</span></label>
                <input
                  className="input mono"
                  type="text"
                  placeholder="provider/model-name"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                />
              </div>

              {/* Max tokens */}
              <div className="field">
                <label className="field-label">Max tokens per request</label>
                <input
                  className="input mono"
                  type="number"
                  min={256} max={32000} step={256}
                  value={maxTok}
                  onChange={(e) => setMaxTok(Number(e.target.value))}
                />
                <span className="field-hint">Recommended: 4096 – 16000</span>
              </div>

              {/* Plan mode */}
              <div className="toggle-row">
                <span className="toggle-label">
                  Plan mode
                  <span className="field-hint" style={{ display: "block", marginTop: 2 }}>Agent creates a todo plan before executing tasks</span>
                </span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={localPlan}
                    onChange={(e) => setLocalPlan(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </>
          )}

          {tab === "mcp" && <McpSettings />}
          {tab === "docker" && <DockerPanel />}
        </div>

        {/* Footer */}
        {tab === "general" && (
          <div className="modal-footer">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn primary"
              onClick={() => {
                onSaveGeneral(key.trim(), effectiveModel, maxTok, localPlan);
                onClose();
              }}
            >
              Save changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
