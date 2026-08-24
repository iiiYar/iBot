import React, { useCallback, useState } from "react";
import { McpSettings } from "../McpSettings";
import { DockerPanel } from "../DockerPanel";
import type { Lang } from "../i18n";
import { STRINGS } from "../i18n";
import type { McpToolInfo } from "../global";

const MODELS = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { id: "openai/gpt-4.1",              label: "GPT-4.1" },
  { id: "google/gemini-2.5-pro",       label: "Gemini 2.5 Pro" },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1" },
  { id: "z-ai/glm-4.6",               label: "GLM 4.6" },
  { id: "qwen/qwen3-coder",            label: "Qwen3 Coder" },
  { id: "stealth/ox-alpha",            label: "Stealth OX Alpha" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
];

export type SettingsTab = "general" | "mcp" | "docker";

export interface SettingsConfig {
  apiKey: string;
  model: string;
  autoApprove: boolean;
  lang: Lang;
  customModels: string[];
}

export interface SettingsModalProps {
  config: SettingsConfig;
  initialTab?: SettingsTab;
  onConfigChange: (patch: Partial<SettingsConfig>) => void;
  onMcpToolsChange: (tools: McpToolInfo[]) => void;
  onClose: () => void;
}

export function SettingsModal({
  config, initialTab = "general", onConfigChange, onMcpToolsChange, onClose,
}: SettingsModalProps) {
  const t   = STRINGS[config.lang];
  const dir = config.lang === "ar" ? "rtl" : "ltr";

  const [tab,        setTab]        = useState<SettingsTab>(initialTab);
  const [showKey,    setShowKey]    = useState(false);
  const [keyStatus,  setKeyStatus]  = useState<"idle" | "testing" | "ok" | "bad">("idle");
  const [newModel,   setNewModel]   = useState("");
  const [modelError, setModelError] = useState("");

  const allModels = [
    ...MODELS,
    ...config.customModels.map((id) => ({ id, label: id })),
  ];

  const testKey = useCallback(async () => {
    if (!config.apiKey.trim()) { setKeyStatus("bad"); return; }
    setKeyStatus("testing");
    try {
      const res = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
      });
      setKeyStatus(res.ok ? "ok" : "bad");
    } catch { setKeyStatus("bad"); }
  }, [config.apiKey]);

  const addModel = useCallback(() => {
    const id = newModel.trim();
    setModelError("");
    if (!id) return;
    if (!/^[a-zA-Z0-9.\-_/:]+$/.test(id)) { setModelError("Invalid model id"); return; }
    if (allModels.some((m) => m.id === id)) { setModelError("Already in list"); setNewModel(""); return; }
    onConfigChange({ customModels: [...config.customModels, id], model: id });
    setNewModel("");
  }, [newModel, allModels, config, onConfigChange]);

  const removeModel = useCallback((id: string) => {
    onConfigChange({
      customModels: config.customModels.filter((m) => m !== id),
      model: config.model === id ? MODELS[0].id : config.model,
    });
  }, [config, onConfigChange]);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-card settings-wide" onClick={(e) => e.stopPropagation()} dir={dir}>

        {/* Tab bar */}
        <div className="settings-tabs">
          <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>
            ⚙ {t.tabGeneral}
          </button>
          <button className={tab === "mcp"     ? "active" : ""} onClick={() => setTab("mcp")}>
            🔌 {t.tabMcp}
          </button>
          <button className={tab === "docker"  ? "active" : ""} onClick={() => setTab("docker")}>
            🐳 {t.tabDocker}
          </button>
        </div>

        {/* ── General ── */}
        {tab === "general" && (
          <>
            <div className="settings-title">{t.settings}</div>

            {/* API Key */}
            <div className="field">
              <label>{t.apiKey}</label>
              <div className="key-row">
                <input
                  type={showKey ? "text" : "password"}
                  value={config.apiKey}
                  placeholder="sk-or-v1-..."
                  dir="ltr"
                  onChange={(e) => { onConfigChange({ apiKey: e.target.value }); setKeyStatus("idle"); }}
                />
                <button className="btn sm ghost" onClick={() => setShowKey((s) => !s)}>
                  {showKey ? "🙈" : "👁"}
                </button>
                <button className="btn sm" onClick={() => void testKey()} disabled={keyStatus === "testing"}>
                  {keyStatus === "testing" ? "…" : "✓"}
                </button>
              </div>
              {keyStatus === "ok"  && <span className="status ok">✓ Key valid</span>}
              {keyStatus === "bad" && <span className="status bad">✕ Invalid key or network error</span>}
            </div>

            {/* Model select */}
            <div className="field">
              <label>{t.model}</label>
              <select value={config.model} onChange={(e) => onConfigChange({ model: e.target.value })} dir="ltr">
                {!allModels.some((m) => m.id === config.model) && (
                  <option value={config.model}>{config.model}</option>
                )}
                <optgroup label="Popular">
                  {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </optgroup>
                {config.customModels.length > 0 && (
                  <optgroup label="My models">
                    {config.customModels.map((id) => <option key={id} value={id}>{id}</option>)}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Add custom model */}
            <div className="field">
              <label>Add custom model <span className="hint-text">(vendor/name from openrouter.ai/models)</span></label>
              <div className="key-row">
                <input value={newModel} dir="ltr" placeholder="e.g. mistralai/mistral-large"
                  onChange={(e) => { setNewModel(e.target.value); setModelError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") addModel(); }} />
                <button className="btn sm primary" onClick={addModel} disabled={!newModel.trim()}>+</button>
              </div>
              {modelError && <span className="status bad">{modelError}</span>}
              {config.customModels.length > 0 && (
                <div className="custom-models" dir="ltr">
                  {config.customModels.map((id) => (
                    <div key={id} className={`custom-model-row ${id === config.model ? "current" : ""}`}>
                      <button className="use-model" onClick={() => onConfigChange({ model: id })}>{id}</button>
                      <button className="remove-model" onClick={() => removeModel(id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Auto-approve */}
            <label className="check-row">
              <input type="checkbox" checked={config.autoApprove}
                onChange={(e) => onConfigChange({ autoApprove: e.target.checked })} />
              {t.autoApprove}
            </label>

            <p className="hint">{t.keyHint}</p>
            <button className="btn primary" onClick={onClose}>OK</button>
          </>
        )}

        {/* ── MCP ── */}
        {tab === "mcp" && <McpSettings onToolsChange={onMcpToolsChange} />}

        {/* ── Docker ── */}
        {tab === "docker" && <DockerPanel />}
      </div>
    </div>
  );
}
