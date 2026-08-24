"use strict";

/**
 * ipc-contract — single source of truth for all IPC channel names.
 * Import this in both main.cjs and preload.cjs to avoid string typos.
 */

const IPC = Object.freeze({
  // ── Dialog & Shell ──────────────────────────────────────────────
  dialog: {
    pickFolder: "dialog:pickFolder",
  },
  shell: {
    openPath: "shell:openPath",
    exec:     "shell:exec",       // alias for proc:run
  },

  // ── File System ─────────────────────────────────────────────────
  fs: {
    list:      "fs:list",
    glob:      "fs:glob",
    grep:      "fs:grep",
    read:      "fs:read",
    readRaw:   "fs:readRaw",
    write:     "fs:write",
    readImage: "fs:readImage",
  },

  // ── Process ─────────────────────────────────────────────────────
  proc: {
    run: "proc:run",
  },

  // ── Network ─────────────────────────────────────────────────────
  net: {
    fetch:  "net:fetch",
    search: "net:search",
  },

  // ── Secrets (safeStorage / DPAPI) ────────────────────────────────
  secrets: {
    set:         "secrets:set",
    get:         "secrets:get",
    delete:      "secrets:delete",
    has:         "secrets:has",
    isAvailable: "secrets:isAvailable",
  },

  // ── Window state ─────────────────────────────────────────────────
  window: {
    state: "window:state",
  },

  // ── Skills ───────────────────────────────────────────────────────
  skills: {
    list: "skills:list",
  },

  // ── Sessions ─────────────────────────────────────────────────────
  sessions: {
    list:   "sessions:list",
    save:   "sessions:save",
    delete: "sessions:delete",
  },

  // ── Docker (Phase 4) ─────────────────────────────────────────────
  docker: {
    status: "docker:status",
    run:    "docker:run",
    list:   "docker:list",
    stop:   "docker:stop",
  },
});

module.exports = { IPC };
