"use strict";

/**
 * mcp-manager.cjs
 * ─────────────────────────────────────────────────────────────────
 * Registry of MCP servers: persists config in userData/mcp-servers.json,
 * manages live connections, and exposes a simple async API consumed by
 * ipcMain handlers in main.cjs.
 */

const fs     = require("node:fs");
const fsp    = require("node:fs/promises");
const path   = require("node:path");
const crypto = require("node:crypto");
const { createMcpConnection } = require("./mcp-client.cjs");

/** @param {Electron.App} app */
function createMcpManager(app) {
  // ── Config path ────────────────────────────────────────────────
  const cfgPath = () => path.join(app.getPath("userData"), "mcp-servers.json");

  function readConfig() {
    try {
      const raw = JSON.parse(fs.readFileSync(cfgPath(), "utf8"));
      return Array.isArray(raw.servers) ? raw.servers : [];
    } catch { return []; }
  }

  async function writeConfig(servers) {
    const target = cfgPath();
    const tmp    = `${target}.${process.pid}.tmp`;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify({ servers }, null, 2), "utf8");
    await fsp.rename(tmp, target);
  }

  // ── Live connections map: id → mcpConnection ───────────────────
  const connections = new Map();

  // ── API ────────────────────────────────────────────────────────
  const manager = {
    // ── Server CRUD ──────────────────────────────────────────────

    listServers() {
      return readConfig().map((s) => ({
        ...s,
        connected: connections.has(s.id),
      }));
    },

    async saveServer(input) {
      const servers  = readConfig();
      const existing = input.id ? servers.find((s) => s.id === input.id) : null;
      const server   = {
        id:      existing?.id ?? crypto.randomUUID(),
        name:    String(input.name    ?? existing?.name    ?? "mcp-server"),
        command: String(input.command ?? existing?.command ?? ""),
        args:    Array.isArray(input.args) ? input.args : (existing?.args ?? []),
        cwd:     input.cwd  ?? existing?.cwd  ?? "",
        env:     input.env  ?? existing?.env  ?? {},
        enabled: input.enabled ?? existing?.enabled ?? true,
      };
      const next = existing
        ? servers.map((s) => (s.id === server.id ? server : s))
        : [server, ...servers];
      await writeConfig(next);
      return { ...server, connected: connections.has(server.id) };
    },

    async deleteServer(id) {
      if (connections.has(id)) { connections.get(id).close(); connections.delete(id); }
      await writeConfig(readConfig().filter((s) => s.id !== id));
      return true;
    },

    // ── Connection lifecycle ─────────────────────────────────────

    async connect(id) {
      const spec = readConfig().find((s) => s.id === id);
      if (!spec)          throw new Error(`MCP server not found: ${id}`);
      if (!spec.command)  throw new Error(`MCP server has no command: ${id}`);

      // Reconnect if already open
      if (connections.has(id)) { connections.get(id).close(); connections.delete(id); }

      const conn = createMcpConnection(spec);
      await conn.initialize();
      connections.set(id, conn);
      return { id, connected: true, pid: conn.pid };
    },

    async disconnect(id) {
      if (connections.has(id)) { connections.get(id).close(); connections.delete(id); }
      return { id, connected: false };
    },

    // ── Tool discovery ───────────────────────────────────────────

    async listTools(id) {
      const conn = connections.get(id);
      if (!conn) throw new Error(`MCP server not connected: ${id}`);
      const result = await conn.listTools();
      const shortId = id.slice(0, 8);
      return (result.tools || []).map((tool) => ({
        /** Namespaced name safe for OpenRouter function calling */
        name:         `mcp_${shortId}_${tool.name}`,
        originalName: tool.name,
        serverId:     id,
        description:  tool.description  || "",
        inputSchema:  tool.inputSchema   || { type: "object", properties: {} },
      }));
    },

    async listAllTools() {
      const out = [];
      for (const [id] of connections) {
        try { out.push(...await manager.listTools(id)); } catch {}
      }
      return out;
    },

    // ── Tool invocation ──────────────────────────────────────────

    async callTool(serverId, originalName, args) {
      const conn = connections.get(serverId);
      if (!conn) throw new Error(`MCP server not connected: ${serverId}`);
      const result = await conn.callTool(originalName, args);
      // Flatten text content blocks into a single string
      if (result.isError) {
        const msg = (result.content || [])
          .filter((c) => c.type === "text").map((c) => c.text).join("\n");
        throw new Error(msg || "MCP tool returned an error");
      }
      const parts = (result.content || [])
        .filter((c) => c.type === "text").map((c) => c.text);
      return parts.join("\n") || JSON.stringify(result);
    },

    // ── Cleanup ──────────────────────────────────────────────────

    closeAll() {
      for (const conn of connections.values()) { try { conn.close(); } catch {} }
      connections.clear();
    },
  };

  return manager;
}

module.exports = { createMcpManager };
