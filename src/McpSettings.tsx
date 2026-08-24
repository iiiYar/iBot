import React, { useCallback, useEffect, useState } from "react";
import type { McpServer, McpToolInfo } from "./global";

// ── Types ─────────────────────────────────────────────────────────────
type FormState = {
  name: string;
  command: string;
  args: string;   // space-separated, parsed on save
  cwd: string;
  env: string;    // JSON object string
};

const EMPTY_FORM: FormState = { name: "", command: "", args: "", cwd: "", env: "" };

function serverToForm(s: McpServer): FormState {
  return {
    name:    s.name,
    command: s.command,
    args:    s.args.join(" "),
    cwd:     s.cwd,
    env:     Object.keys(s.env).length ? JSON.stringify(s.env, null, 2) : "",
  };
}

function parseEnv(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
}

// ── Component ───────────────────────────────────────────────────────────
export function McpSettings({ onToolsChange }: { onToolsChange?: (tools: McpToolInfo[]) => void }) {
  const [servers, setServers]           = useState<McpServer[]>([]);
  const [loading, setLoading]           = useState(true);
  const [editing, setEditing]           = useState<string | null>(null); // server id or "new"
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy]                 = useState<Record<string, string>>({}); // id → action
  const [error, setError]               = useState("");
  const [expandedTools, setExpandedTools] = useState<string | null>(null);
  const [serverTools, setServerTools]   = useState<Record<string, McpToolInfo[]>>({});

  const refresh = useCallback(async () => {
    try {
      const list = await window.botyar.mcpListServers();
      setServers(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Notify parent whenever any server is (dis)connected
  const notifyTools = useCallback(async () => {
    try {
      const tools = await window.botyar.mcpListAllTools();
      onToolsChange?.(tools);
    } catch {}
  }, [onToolsChange]);

  const setBusyFor = (id: string, action: string) =>
    setBusy((prev) => ({ ...prev, [id]: action }));
  const clearBusy = (id: string) =>
    setBusy((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const handleConnect = useCallback(async (id: string) => {
    setBusyFor(id, "connect");
    setError("");
    try {
      await window.botyar.mcpConnect(id);
      await refresh();
      await notifyTools();
    } catch (e) { setError(String(e)); }
    finally { clearBusy(id); }
  }, [refresh, notifyTools]);

  const handleDisconnect = useCallback(async (id: string) => {
    setBusyFor(id, "disconnect");
    try {
      await window.botyar.mcpDisconnect(id);
      await refresh();
      await notifyTools();
      setServerTools((prev) => { const n = { ...prev }; delete n[id]; return n; });
      if (expandedTools === id) setExpandedTools(null);
    } catch (e) { setError(String(e)); }
    finally { clearBusy(id); }
  }, [refresh, notifyTools, expandedTools]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this MCP server?")) return;
    setBusyFor(id, "delete");
    try {
      await window.botyar.mcpDeleteServer(id);
      await refresh();
      await notifyTools();
    } catch (e) { setError(String(e)); }
    finally { clearBusy(id); }
  }, [refresh, notifyTools]);

  const handleSave = useCallback(async () => {
    if (!form.command.trim()) { setError("Command is required"); return; }
    setError("");
    const id = editing === "new" ? undefined : (editing ?? undefined);
    try {
      await window.botyar.mcpSaveServer({
        id,
        name:    form.name || form.command,
        command: form.command.trim(),
        args:    form.args.trim() ? form.args.trim().split(/\s+/) : [],
        cwd:     form.cwd.trim(),
        env:     parseEnv(form.env),
      });
      setEditing(null);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [form, editing, refresh]);

  const startEdit = useCallback((server: McpServer) => {
    setEditing(server.id);
    setForm(serverToForm(server));
    setError("");
  }, []);

  const handleLoadTools = useCallback(async (id: string) => {
    if (expandedTools === id) { setExpandedTools(null); return; }
    try {
      const tools = await window.botyar.mcpListTools(id);
      setServerTools((prev) => ({ ...prev, [id]: tools }));
      setExpandedTools(id);
    } catch (e) { setError(String(e)); }
  }, [expandedTools]);

  if (loading) return <div className="mcp-loading">Loading MCP servers…</div>;

  return (
    <div className="mcp-settings">
      <div className="mcp-header">
        <span className="mcp-title">MCP Servers</span>
        <button className="btn sm primary" onClick={() => { setEditing("new"); setForm(EMPTY_FORM); setError(""); }}>+ Add</button>
      </div>

      {error && <div className="mcp-error">{error}</div>}

      {/* ─ Form ─ */}
      {editing !== null && (
        <div className="mcp-form">
          <div className="mcp-form-title">{editing === "new" ? "New Server" : "Edit Server"}</div>
          <div className="mcp-field">
            <label>Name</label>
            <input value={form.name} placeholder="e.g. filesystem" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="mcp-field">
            <label>Command <span className="req">*</span></label>
            <input value={form.command} placeholder="npx" dir="ltr" onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))} />
          </div>
          <div className="mcp-field">
            <label>Args <span className="hint-text">(space-separated)</span></label>
            <input value={form.args} placeholder="-y @modelcontextprotocol/server-filesystem C:/path" dir="ltr"
              onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))} />
          </div>
          <div className="mcp-field">
            <label>Working Dir <span className="hint-text">(optional)</span></label>
            <input value={form.cwd} dir="ltr" onChange={(e) => setForm((f) => ({ ...f, cwd: e.target.value }))} />
          </div>
          <div className="mcp-field">
            <label>Env <span className="hint-text">({"{ \"KEY\": \"VALUE\" }"})</span></label>
            <textarea value={form.env} dir="ltr" rows={2} placeholder='{ "API_KEY": "sk-..." }'
              onChange={(e) => setForm((f) => ({ ...f, env: e.target.value }))} />
          </div>
          <div className="mcp-form-actions">
            <button className="btn primary sm" onClick={() => void handleSave()}>Save</button>
            <button className="btn sm ghost" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ─ List ─ */}
      {servers.length === 0 && editing === null && (
        <div className="mcp-empty">No MCP servers configured. Click “+ Add” to add one.</div>
      )}

      {servers.map((srv) => {
        const isBusy   = !!busy[srv.id];
        const toolList = serverTools[srv.id];
        const expanded = expandedTools === srv.id;

        return (
          <div key={srv.id} className={`mcp-server-row ${srv.connected ? "connected" : ""}`}>
            <div className="mcp-srv-head">
              <span className={`mcp-dot ${srv.connected ? "on" : "off"}`} title={srv.connected ? "Connected" : "Disconnected"} />
              <span className="mcp-srv-name">{srv.name}</span>
              <span className="mcp-srv-cmd" dir="ltr">{srv.command} {srv.args.join(" ")}</span>
              <div className="mcp-srv-actions">
                {srv.connected ? (
                  <>
                    <button className="btn xs" disabled={isBusy} onClick={() => void handleLoadTools(srv.id)} title="Show tools">
                      {expanded ? "▲ tools" : `🔧 ${toolList ? toolList.length : "?"}`}
                    </button>
                    <button className="btn xs danger" disabled={isBusy} onClick={() => void handleDisconnect(srv.id)}>
                      {busy[srv.id] === "disconnect" ? "…" : "Disconnect"}
                    </button>
                  </>
                ) : (
                  <button className="btn xs primary" disabled={isBusy} onClick={() => void handleConnect(srv.id)}>
                    {busy[srv.id] === "connect" ? "…" : "Connect"}
                  </button>
                )}
                <button className="btn xs ghost" disabled={isBusy} onClick={() => startEdit(srv)} title="Edit">✏️</button>
                <button className="btn xs danger" disabled={isBusy} onClick={() => void handleDelete(srv.id)} title="Delete">✕</button>
              </div>
            </div>

            {expanded && toolList && (
              <div className="mcp-tools-list">
                {toolList.length === 0 && <span className="muted">No tools exposed by this server</span>}
                {toolList.map((tool) => (
                  <div key={tool.name} className="mcp-tool-row" title={tool.description}>
                    <code dir="ltr">{tool.originalName}</code>
                    {tool.description && <span className="mcp-tool-desc">{tool.description}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
