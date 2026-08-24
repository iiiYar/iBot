import React, { useCallback, useEffect, useState } from "react";

interface DockerContainer {
  id: string; name: string; image: string; status: string; ports: string;
}

const docker = {
  async status(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      const res = await window.botyar.runCommand(".", "docker version --format '{{.Server.Version}}'");
      if (res.code === 0 && res.stdout.trim()) return { available: true, version: res.stdout.trim() };
      return { available: false, error: res.stderr.trim() || "Docker not running" };
    } catch (e) { return { available: false, error: String(e) }; }
  },

  async listContainers(): Promise<DockerContainer[]> {
    const res = await window.botyar.runCommand(
      ".",
      `docker ps -a --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"`
    );
    if (res.code !== 0 || !res.stdout.trim()) return [];
    return res.stdout.trim().split("\n").map((line) => {
      const [id="", name="", image="", status="", ports=""] = line.split("\t");
      return { id: id.trim(), name: name.trim(), image: image.trim(), status: status.trim(), ports: ports.trim() };
    });
  },

  async runContainer(image: string, flags: string): Promise<string> {
    const res = await window.botyar.runCommand(".", `docker run -d ${flags} ${image}`);
    if (res.code !== 0) throw new Error(res.stderr || "docker run failed");
    return res.stdout.trim();
  },

  async stopContainer(id: string): Promise<void> {
    const res = await window.botyar.runCommand(".", `docker stop ${id}`);
    if (res.code !== 0) throw new Error(res.stderr || "docker stop failed");
  },

  async removeContainer(id: string): Promise<void> {
    const res = await window.botyar.runCommand(".", `docker rm -f ${id}`);
    if (res.code !== 0) throw new Error(res.stderr || "docker rm failed");
  },
};

function RunForm({ onRun }: { onRun: () => void }) {
  const [image,  setImage]  = useState("");
  const [flags,  setFlags]  = useState("");
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");
  const [result, setResult] = useState("");

  const handleRun = async () => {
    if (!image.trim()) { setError("Image name required"); return; }
    setBusy(true); setError(""); setResult("");
    try {
      const id = await docker.runContainer(image.trim(), flags.trim());
      setResult(`Started: ${id.slice(0, 12)}`);
      setImage(""); setFlags(""); onRun();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };

  return (
    <div style={{
      padding: "var(--space-4)",
      background: "var(--glass-bg)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      display: "flex", flexDirection: "column", gap: "var(--space-3)",
    }}>
      <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--text-secondary)" }}>
        Run new container
      </div>
      <div className="field">
        <label className="field-label">Image</label>
        <input className="input mono" value={image} placeholder="nginx:alpine" dir="ltr"
          onChange={(e) => setImage(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label">Flags <span className="field-hint">(optional)</span></label>
        <input className="input mono" value={flags} dir="ltr"
          placeholder="-p 8080:80 --name myapp"
          onChange={(e) => setFlags(e.target.value)} />
      </div>
      {error  && (
        <div style={{ color: "var(--red-400)", fontSize: "var(--text-xs)" }}>{error}</div>
      )}
      {result && (
        <div style={{ color: "var(--green-400)", fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)" }}>
          ✓ {result}
        </div>
      )}
      <button className="btn primary sm" disabled={busy || !image.trim()}
        onClick={() => void handleRun()}>
        {busy ? "…" : "docker run -d"}
      </button>
    </div>
  );
}

export function DockerPanel() {
  const [status,     setStatus]     = useState<{ available: boolean; version?: string; error?: string } | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [busy,       setBusy]       = useState<Record<string, string>>({});
  const [error,      setError]      = useState("");
  const [showRun,    setShowRun]    = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [st, list] = await Promise.all([docker.status(), docker.listContainers()]);
      setStatus(st); setContainers(list);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleStop = useCallback(async (id: string) => {
    setBusy((p) => ({ ...p, [id]: "stop" })); setError("");
    try { await docker.stopContainer(id); await refresh(); }
    catch (e) { setError(String(e)); }
    finally { setBusy((p) => { const n={...p}; delete n[id]; return n; }); }
  }, [refresh]);

  const handleRemove = useCallback(async (id: string) => {
    if (!confirm(`Remove container ${id.slice(0, 12)}?`)) return;
    setBusy((p) => ({ ...p, [id]: "rm" })); setError("");
    try { await docker.removeContainer(id); await refresh(); }
    catch (e) { setError(String(e)); }
    finally { setBusy((p) => { const n={...p}; delete n[id]; return n; }); }
  }, [refresh]);

  if (loading) return (
    <div className="empty-state" style={{ padding: "var(--space-8)" }}>
      <span className="dot-running" />
      <span>Checking Docker…</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

      {/* Docker status bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--glass-bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}>
        <span className={`mcp-status-dot ${status?.available ? "on" : "off"}`} />
        {status?.available
          ? <span style={{ fontSize: "var(--text-sm)", color: "var(--green-400)" }}>
              Docker {status.version}
            </span>
          : <span style={{ fontSize: "var(--text-sm)", color: "var(--red-400)" }}>
              {status?.error ?? "Docker not available"}
            </span>
        }
        <div style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={() => void refresh()} title="Refresh">↻</button>
      </div>

      {error && (
        <div style={{
          padding: "var(--space-3)",
          background: "rgba(239,68,68,.10)",
          border: "1px solid var(--border-error)",
          borderRadius: "var(--radius-md)",
          color: "var(--red-400)",
          fontSize: "var(--text-sm)",
        }}>{error}</div>
      )}

      {status?.available && (
        <>
          {/* Section head */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{
              fontSize: "var(--text-2xs)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "var(--tracking-widest)",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}>Containers</div>
            <button className="btn primary sm" onClick={() => setShowRun((v) => !v)}>
              {showRun ? "Cancel" : "+ Run"}
            </button>
          </div>

          {showRun && <RunForm onRun={() => { setShowRun(false); void refresh(); }} />}

          {containers.length === 0 ? (
            <div className="empty-state" style={{ padding: "var(--space-6)" }}>
              <span style={{ fontSize: 24, opacity: .3 }}>🐳</span>
              <span>No containers found</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {containers.map((c) => {
                const isRunning = c.status.toLowerCase().startsWith("up");
                const isBusy    = !!busy[c.id];
                return (
                  <div key={c.id} style={{
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--glass-bg)",
                    border: `1px solid ${isRunning ? "rgba(16,185,129,.25)" : "var(--border)"}`,
                    borderRadius: "var(--radius-md)",
                    display: "flex", flexDirection: "column", gap: "var(--space-2)",
                    transition: "border-color var(--dur-fast) var(--ease-out)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <span className={`mcp-status-dot ${isRunning ? "on" : "off"}`} />
                      <span style={{ fontWeight: "var(--weight-medium)", fontSize: "var(--text-sm)", flex: 1 }}
                        dir="ltr">{c.name}</span>
                      <span className="chip" style={{ fontFamily: "var(--font-mono)" }} dir="ltr">{c.image}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <span style={{ fontSize: "var(--text-xs)", color: isRunning ? "var(--green-400)" : "var(--text-muted)" }}>
                        {c.status}
                      </span>
                      {c.ports && (
                        <span className="chip" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }} dir="ltr">
                          {c.ports}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      {isRunning && (
                        <button className="btn sm danger" disabled={isBusy}
                          onClick={() => void handleStop(c.id)}>
                          {busy[c.id] === "stop" ? "…" : "Stop"}
                        </button>
                      )}
                      <button className="btn sm ghost" disabled={isBusy}
                        onClick={() => void handleRemove(c.id)}>
                        {busy[c.id] === "rm" ? "…" : "Remove"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
