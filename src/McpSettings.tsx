import React, { useCallback, useEffect, useState } from "react";
import type { McpServer, McpToolInfo } from "./global";

type FormState = {
  name: string; command: string;
  args: string; cwd: string; env: string;
};

const EMPTY: FormState = { name: "", command: "", args: "", cwd: "", env: "" };

function serverToForm(s: McpServer): FormState {
  return {
    name: s.name, command: s.command,
    args: s.args.join(" "), cwd: s.cwd,
    env: Object.keys(s.env).length ? JSON.stringify(s.env, null, 2) : "",
  };
}

function parseEnv(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
}

export default function McpSettings({ onToolsChange }: { onToolsChange?: (tools: McpToolInfo[]) => void }) {
  const [servers,       setServers]       = useState<McpServer[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [editing,       setEditing]       = useState<string | null>(null);
  const [form,          setForm]          = useState<FormState>(EMPTY);
  const [busy,          setBusy]          = useState<Record<string, string>>({});
  const [error,         setError]         = useState("");
  const [expandedTools, setExpandedTools] = useState<string | null>(null);
  const [serverTools,   setServerTools]   = useState<Record<string, McpToolInfo[]>>({});

  const refresh = useCallback(async () => {
    try { setServers(await window.botyar.mcpListServers()); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const notifyTools = useCallback(async () => {
    try { onToolsChange?.(await window.botyar.mcpListAllTools()); } catch {}
  }, [onToolsChange]);

  const busySet   = (id: string, a: string) => setBusy((p) => ({ ...p, [id]: a }));
  const busyClear = (id: string)            => setBusy((p) => { const n={...p}; delete n[id]; return n; });

  const handleConnect = useCallback(async (id: string) => {
    busySet(id, "connect"); setError("");
    try { await window.botyar.mcpConnect(id); await refresh(); await notifyTools(); }
    catch (e) { setError(String(e)); } finally { busyClear(id); }
  }, [refresh, notifyTools]);

  const handleDisconnect = useCallback(async (id: string) => {
    busySet(id, "disconnect");
    try {
      await window.botyar.mcpDisconnect(id); await refresh(); await notifyTools();
      setServerTools((p) => { const n={...p}; delete n[id]; return n; });
      if (expandedTools === id) setExpandedTools(null);
    } catch (e) { setError(String(e)); } finally { busyClear(id); }
  }, [refresh, notifyTools, expandedTools]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this MCP server?")) return;
    busySet(id, "delete");
    try { await window.botyar.mcpDeleteServer(id); await refresh(); await notifyTools(); }
    catch (e) { setError(String(e)); } finally { busyClear(id); }
  }, [refresh, notifyTools]);

  const handleSave = useCallback(async () => {
    if (!form.command.trim()) { setError("Command is required"); return; }
    setError("");
    const id = editing === "new" ? undefined : (editing ?? undefined);
    try {
      await window.botyar.mcpSaveServer({
        id, name: form.name || form.command,
        command: form.command.trim(),
        args:    form.args.trim() ? form.args.trim().split(/\s+/) : [],
        cwd:     form.cwd.trim(),
        env:     parseEnv(form.env),
      });
      setEditing(null); setForm(EMPTY); await refresh();
    } catch (e) { setError(String(e)); }
  }, [form, editing, refresh]);

  const handleLoadTools = useCallback(async (id: string) => {
    if (expandedTools === id) { setExpandedTools(null); return; }
    try {
      const tools = await window.botyar.mcpListTools(id);
      setServerTools((p) => ({ ...p, [id]: tools }));
      setExpandedTools(id);
    } catch (e) { setError(String(e)); }
  }, [expandedTools]);

  if (loading) return (
    <div className="empty-state" style={{ padding: "var(--space-8)" }}>
      <span className="dot-running" />
      <span>Loading MCP servers…</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text-secondary)" }}>
          🔌 MCP Servers
        </div>
        <button className="btn primary sm" onClick={() => { setEditing("new"); setForm(EMPTY); setError(""); }}>
          + Add server
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "var(--space-3) var(--space-4)",
          background: "rgba(239,68,68,.10)",
          border: "1px solid var(--border-error)",
          borderRadius: "var(--radius-md)",
          color: "var(--red-400)",
          fontSize: "var(--text-sm)",
        }}>
          {error}
        </div>
      )}

      {/* Edit / New form */}
      {editing !== null && (
        <div className="mcp-form">
          <div className="mcp-form-title">
            {editing === "new" ? "New MCP Server" : "Edit Server"}
          </div>

          <div className="field">
            <label className="field-label">Name</label>
            <input className="input" value={form.name} placeholder="e.g. filesystem"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Command <span style={{ color: "var(--red-400)" }}>*</span></label>
            <input className="input mono" value={form.command} placeholder="npx" dir="ltr"
              onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Args <span className="field-hint">(space-separated)</span></label>
            <input className="input mono" value={form.args} dir="ltr"
              placeholder="-y @modelcontextprotocol/server-filesystem C:/path"
              onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Working Dir <span className="field-hint">(optional)</span></label>
            <input className="input mono" value={form.cwd} dir="ltr"
              onChange={(e) => setForm((f) => ({ ...f, cwd: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Env <span className="field-hint">({"{ \"KEY\": \"VALUE\" }"})</span></label>
            <textarea className="input mono" value={form.env} dir="ltr" rows={3}
              placeholder='{ "API_KEY": "sk-..." }' style={{ resize: "vertical" }}
              onChange={(e) => setForm((f) => ({ ...f, env: e.target.value }))} />
          </div>

          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <button className="btn ghost sm" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
            <button className="btn primary sm" onClick={() => void handleSave()}>Save server</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {servers.length === 0 && editing === null && (
        <div className="empty-state" style={{ padding: "var(--space-8)" }}>
          <span style={{ fontSize: 28, opacity: .3 }}>🔌</span>
          <span>No MCP servers configured.<br />Click "+ Add server" to get started.</span>
        </div>
      )}

      {/* Server list */}
      {servers.map((srv) => {
        const isBusy   = !!busy[srv.id];
        const toolList = serverTools[srv.id];
        const expanded = expandedTools === srv.id;

        return (
          <div key={srv.id} className={`mcp-server-card ${srv.connected ? "connected" : ""}`}>
            <div className="mcp-server-card-head">
              <span className={`mcp-status-dot ${srv.connected ? "on" : "off"}`} />
              <div className="mcp-server-card-info">
                <span className="mcp-server-name">{srv.name}</span>
                <span className="mcp-server-cmd" dir="ltr">{srv.command} {srv.args.join(" ")}</span>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexShrink: 0 }}>
                {srv.connected ? (
                  <>
                    <button className="btn sm ghost" disabled={isBusy}
                      onClick={() => void handleLoadTools(srv.id)}>
                      {expanded ? "▴ Tools" : `🔧 ${toolList ? toolList.length : "?"}` }
                    </button>
                    <button className="btn sm danger" disabled={isBusy}
                      onClick={() => void handleDisconnect(srv.id)}>
                      {busy[srv.id] === "disconnect" ? "…" : "Disconnect"}
                    </button>
                  </>
                ) : (
                  <button className="btn sm primary" disabled={isBusy}
                    onClick={() => void handleConnect(srv.id)}>
                    {busy[srv.id] === "connect" ? "…" : "Connect"}
                  </button>
                )}
                <button className="btn sm ghost icon" disabled={isBusy}
                  onClick={() => { setEditing(srv.id); setForm(serverToForm(srv)); setError(""); }}
                  title="Edit">✏️</button>
                <button className="btn sm danger icon" disabled={isBusy}
                  onClick={() => void handleDelete(srv.id)} title="Delete">✕</button>
              </div>
            </div>

            {expanded && toolList && (
              <div className="mcp-tools-list">
                {toolList.length === 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>No tools exposed</span>
                )}
                {toolList.map((tool) => (
                  <div key={tool.name} className="mcp-tool-row" title={tool.description}>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-accent)" }}
                      dir="ltr">{tool.originalName}</code>
                    {tool.description && (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tool.description}
                      </span>
                    )}
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
