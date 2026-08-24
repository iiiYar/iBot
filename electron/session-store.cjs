"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function now() { return Date.now(); }
function newId() { return crypto.randomUUID(); }

function sessionsDir(app) {
  return path.join(app.getPath("userData"), "sessions");
}

function normalize(session) {
  const id = session?.id || newId();
  const createdAt = session?.createdAt ?? now();
  return {
    id,
    projectId:  session?.projectId  ?? null,
    title:      String(session?.title  || "جلسة جديدة"),
    model:      String(session?.model  || ""),
    messages:   Array.isArray(session?.messages) ? session.messages : [],
    tokenUsage: session?.tokenUsage ?? { prompt: 0, completion: 0, total: 0 },
    createdAt,
    updatedAt:  session?.updatedAt ?? createdAt,
  };
}

function createSessionStore(app) {
  const dir = () => sessionsDir(app);

  function ensureDir() {
    fs.mkdirSync(dir(), { recursive: true });
  }

  function fileFor(id) {
    return path.join(dir(), `${id}.json`);
  }

  function readOne(id) {
    try {
      return normalize(JSON.parse(fs.readFileSync(fileFor(id), "utf8")));
    } catch {
      return null;
    }
  }

  async function writeOne(session) {
    ensureDir();
    const target = fileFor(session.id);
    const temp = `${target}.${process.pid}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(session, null, 2), "utf8");
    await fsp.rename(temp, target);
  }

  return {
    /** Returns all sessions, optionally filtered by projectId */
    list(projectId) {
      if (!fs.existsSync(dir())) return [];
      const out = [];
      for (const file of fs.readdirSync(dir())) {
        if (!file.endsWith(".json")) continue;
        try {
          const session = normalize(JSON.parse(fs.readFileSync(path.join(dir(), file), "utf8")));
          if (!projectId || session.projectId === projectId) out.push(session);
        } catch {}
      }
      return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    },

    get(id) {
      return readOne(id);
    },

    async save(input) {
      const existing = input.id ? readOne(input.id) : null;
      const session = normalize({
        ...existing,
        ...input,
        id:        existing?.id ?? input.id ?? newId(),
        createdAt: existing?.createdAt ?? input.createdAt ?? now(),
        updatedAt: now(),
      });
      await writeOne(session);
      return session;
    },

    async delete(id) {
      try { fs.rmSync(fileFor(id), { force: true }); } catch {}
      return true;
    },
  };
}

module.exports = { createSessionStore, sessionsDir, normalize };
