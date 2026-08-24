"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const { IPC } = require("./ipc-contract.cjs");

contextBridge.exposeInMainWorld("botyar", {
  // ── Dialog & Shell ────────────────────────────────────────────────
  pickFolder:  () => ipcRenderer.invoke(IPC.dialog.pickFolder),
  openPath:    (target) => ipcRenderer.invoke(IPC.shell.openPath, target),

  // ── File System ───────────────────────────────────────────────────
  fsList:      (root, rel) => ipcRenderer.invoke(IPC.fs.list, root, rel),
  fsGlob:      (root, pattern) => ipcRenderer.invoke(IPC.fs.glob, root, pattern),
  fsGrep:      (root, pattern, glob) => ipcRenderer.invoke(IPC.fs.grep, root, pattern, glob),
  fsRead:      (root, rel, startLine, endLine) => ipcRenderer.invoke(IPC.fs.read, root, rel, startLine, endLine),
  fsReadRaw:   (root, rel) => ipcRenderer.invoke(IPC.fs.readRaw, root, rel),
  fsWrite:     (root, rel, content) => ipcRenderer.invoke(IPC.fs.write, root, rel, content),
  fsReadImage: (root, rel) => ipcRenderer.invoke(IPC.fs.readImage, root, rel),

  // ── Process ───────────────────────────────────────────────────────
  runCommand:  (root, command) => ipcRenderer.invoke(IPC.proc.run, root, command),

  // ── Network ───────────────────────────────────────────────────────
  netFetch:    (url) => ipcRenderer.invoke(IPC.net.fetch, url),
  netSearch:   (term) => ipcRenderer.invoke(IPC.net.search, term),

  // ── Secrets ───────────────────────────────────────────────────────
  secretsIsAvailable: () => ipcRenderer.invoke(IPC.secrets.isAvailable),
  secretsSet:         (key, value) => ipcRenderer.invoke(IPC.secrets.set, key, value),
  secretsGet:         (key) => ipcRenderer.invoke(IPC.secrets.get, key),
  secretsDelete:      (key) => ipcRenderer.invoke(IPC.secrets.delete, key),
  secretsHas:         (key) => ipcRenderer.invoke(IPC.secrets.has, key),

  // ── Skills ────────────────────────────────────────────────────────
  skillsList:  (root) => ipcRenderer.invoke(IPC.skills.list, root),

  // ── Sessions ──────────────────────────────────────────────────────
  sessionsSave:   (session) => ipcRenderer.invoke(IPC.sessions.save, session),
  sessionsList:   () => ipcRenderer.invoke(IPC.sessions.list),
  sessionsDelete: (id) => ipcRenderer.invoke(IPC.sessions.delete, id),
});
