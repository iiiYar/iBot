"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function now() { return Date.now(); }
function newId() { return crypto.randomUUID(); }

function projectsDir(app) {
  return path.join(app.getPath("userData"), "projects");
}

function createProjectStore(app) {
  const dir = () => projectsDir(app);

  function ensureDir() {
    fs.mkdirSync(dir(), { recursive: true });
  }

  function fileFor(id) {
    return path.join(dir(), `${id}.json`);
  }

  function readOne(id) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(id), "utf8"));
    } catch {
      return null;
    }
  }

  async function writeOne(project) {
    ensureDir();
    const target = fileFor(project.id);
    const temp = `${target}.${process.pid}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(project, null, 2), "utf8");
    await fsp.rename(temp, target);
  }

  return {
    list() {
      if (!fs.existsSync(dir())) return [];
      const out = [];
      for (const file of fs.readdirSync(dir())) {
        if (!file.endsWith(".json")) continue;
        try {
          out.push(JSON.parse(fs.readFileSync(path.join(dir(), file), "utf8")));
        } catch {}
      }
      return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    },

    get(id) {
      return readOne(id);
    },

    async save(input) {
      const existing = input.id ? readOne(input.id) : null;
      const project = {
        id: existing?.id ?? input.id ?? newId(),
        name: String(input.name || existing?.name || path.basename(input.rootPath || "Project")),
        rootPath: String(input.rootPath || existing?.rootPath || ""),
        lastSessionId: input.lastSessionId ?? existing?.lastSessionId ?? null,
        createdAt: existing?.createdAt ?? input.createdAt ?? now(),
        updatedAt: now(),
      };
      await writeOne(project);
      return project;
    },

    async delete(id) {
      try { fs.rmSync(fileFor(id), { force: true }); } catch {}
      return true;
    },

    async touchSession(id, sessionId) {
      const project = readOne(id);
      if (!project) return null;
      project.lastSessionId = sessionId;
      project.updatedAt = now();
      await writeOne(project);
      return project;
    },
  };
}

module.exports = { createProjectStore, projectsDir };
