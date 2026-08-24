"use strict";

/**
 * mcp-client.cjs
 * ─────────────────────────────────────────────────────────────────
 * Minimal MCP-over-stdio client (JSON-RPC 2.0, no SDK dependency).
 * Spawns a child process, sends newline-delimited JSON, reads responses.
 */

const { spawn } = require("node:child_process");

const PROTOCOL_VERSION = "2024-11-05";

/**
 * @param {{ command: string; args?: string[]; cwd?: string; env?: Record<string,string> }} spec
 */
function createMcpConnection(spec) {
  const child = spawn(spec.command, spec.args || [], {
    cwd:  spec.cwd  || undefined,
    env:  { ...process.env, ...(spec.env || {}) },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let nextId  = 1;
  const pending = new Map(); // id → { resolve, reject, timer }
  let lineBuffer = "";

  // ── Read loop ──────────────────────────────────────────────────
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    lineBuffer += chunk;
    let nl;
    while ((nl = lineBuffer.indexOf("\n")) !== -1) {
      const line = lineBuffer.slice(0, nl).trim();
      lineBuffer  = lineBuffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id == null) continue; // notification — ignore
      const waiter = pending.get(msg.id);
      if (!waiter) continue;
      clearTimeout(waiter.timer);
      pending.delete(msg.id);
      if (msg.error)
        waiter.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else
        waiter.resolve(msg.result);
    }
  });

  // ── Error / close ──────────────────────────────────────────────
  function rejectAll(reason) {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
    pending.clear();
  }
  child.on("error", rejectAll);
  child.on("close", () => rejectAll(new Error("MCP server process closed")));

  // ── Send helpers ───────────────────────────────────────────────
  function request(method, params, timeoutMs = 30_000) {
    const id = nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(payload, (err) => {
        if (err) { clearTimeout(timer); pending.delete(id); reject(err); }
      });
    });
  }

  function notify(method, params) {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    child.stdin.write(payload);
  }

  // ── Public API ─────────────────────────────────────────────────
  return {
    /**
     * MCP handshake: initialize → notifications/initialized
     * Must be called once before any other request.
     */
    async initialize() {
      const result = await request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities:    {},
        clientInfo:      { name: "iBot", version: "0.3.0" },
      });
      notify("notifications/initialized", {});
      return result;
    },

    /** Returns { tools: [ { name, description, inputSchema } ] } */
    listTools() {
      return request("tools/list", {});
    },

    /** Returns { content: [ { type, text } ], isError?: boolean } */
    callTool(name, args) {
      return request("tools/call", { name, arguments: args || {} });
    },

    /** Kill the child process. */
    close() {
      try { child.kill(); } catch {}
    },

    get pid() { return child.pid; },
  };
}

module.exports = { createMcpConnection };
