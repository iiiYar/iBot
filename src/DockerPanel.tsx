import React, { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────
interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
}

// ── Helpers ───────────────────────────────────────────────────────────
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
      const [id = "", name = "", image = "", status = "", ports = ""] = line.split("\t");
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

// ── RunForm ──────────────────────────────────────────────────────────
function RunForm({ onRun }: { onRun: () => void }) {
  const [image, setImage]   = useState("");
  const [flags, setFlags]   = useState("");
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState("");
  const [result, setResult] = useState("");

  const handleRun = async () => {
    if (!image.trim()) { setError("Image name required"); return; }
    setBusy(true); setError(""); setResult("");
    try {
      const id = await docker.runContainer(image.trim(), flags.trim());
      setResult(`Started: ${id.slice(0, 12)}`);
      setImage(""); setFlags("");
      onRun();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="docker-run-form">
      <div className="docker-field">
        <label>Image</label>
        <input value={image} placeholder="nginx:alpine" dir="ltr" onChange={(e) => setImage(e.target.value)} />
      </div>
      <div className="docker-field">
        <label>Flags <span className="hint-text">(optional)</span></label>
        <input value={flags} dir="ltr" placeholder="-p 8080:80 --name myapp" onChange={(e) => setFlags(e.target.value)} />
      </div>
      {error && <div className="docker-error">{error}</div>}
      {result && <div className="docker-ok">{result}</div>}
      <button className="btn primary sm" disabled={busy || !image.trim()} onClick={() => void handleRun()}>
        {busy ? "…" : "docker run"}
      </button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────
export function DockerPanel() {
  const [status, setStatus]         = useState<{ available: boolean; version?: string; error?: string } | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState<Record<string, string>>({});
  const [error, setError]           = useState("");
  const [showRun, setShowRun]       = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [st, list] = await Promise.all([docker.status(), docker.listContainers()]);
      setStatus(st);
      setContainers(list);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleStop = useCallback(async (id: string) => {
    setBusy((prev) => ({ ...prev, [id]: "stop" }));
    setError("");
    try { await docker.stopContainer(id); await refresh(); }
    catch (e) { setError(String(e)); }
    finally { setBusy((prev) => { const n = { ...prev }; delete n[id]; return n; }); }
  }, [refresh]);

  const handleRemove = useCallback(async (id: string) => {
    if (!confirm(`Remove container ${id.slice(0, 12)}?`)) return;
    setBusy((prev) => ({ ...prev, [id]: "rm" }));
    setError("");
    try { await docker.removeContainer(id); await refresh(); }
    catch (e) { setError(String(e)); }
    finally { setBusy((prev) => { const n = { ...prev }; delete n[id]; return n; }); }
  }, [refresh]);

  if (loading) return <div className="docker-loading">Checking Docker…</div>;

  return (
    <div className="docker-panel">
      {/* Status bar */}
      <div className="docker-status-bar">
        <span className={`docker-dot ${status?.available ? "on" : "off"}`} />
        {status?.available
          ? <span className="docker-version">Docker {status.version}</span>
          : <span className="docker-unavail">{status?.error ?? "Docker not available"}</span>}
        <button className="btn xs ghost" onClick={() => void refresh()} title="Refresh">↻</button>
      </div>

      {error && <div className="docker-error">{error}</div>}

      {status?.available && (
        <>
          {/* Run new container */}
          <div className="docker-section-head">
            <span>Containers</span>
            <button className="btn xs primary" onClick={() => setShowRun((v) => !v)}>{showRun ? "Cancel" : "+ Run"}</button>
          </div>
          {showRun && <RunForm onRun={() => { setShowRun(false); void refresh(); }} />}

          {/* Container list */}
          {containers.length === 0
            ? <div className="docker-empty">No containers found</div>
            : (
              <div className="docker-list">
                {containers.map((c) => {
                  const isRunning = c.status.toLowerCase().startsWith("up");
                  const isBusy    = !!busy[c.id];
                  return (
                    <div key={c.id} className={`docker-row ${isRunning ? "running" : "stopped"}`}>
                      <div className="docker-row-head">
                        <span className={`docker-dot ${isRunning ? "on" : "off"}`} />
                        <span className="docker-name" dir="ltr">{c.name}</span>
                        <span className="docker-image" dir="ltr">{c.image}</span>
                      </div>
                      <div className="docker-row-sub">
                        <span className="docker-status">{c.status}</span>
                        {c.ports && <span className="docker-ports" dir="ltr">{c.ports}</span>}
                      </div>
                      <div className="docker-row-actions">
                        {isRunning && (
                          <button className="btn xs danger" disabled={isBusy} onClick={() => void handleStop(c.id)}>
                            {busy[c.id] === "stop" ? "…" : "Stop"}
                          </button>
                        )}
                        <button className="btn xs ghost" disabled={isBusy} onClick={() => void handleRemove(c.id)}>
                          {busy[c.id] === "rm" ? "…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </>
      )}
    </div>
  );
}
