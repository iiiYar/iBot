"use strict";

const fsSync = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { MIN_SIZE, resolvePlacement, WindowStateStore } = require("./window-state-store.cjs");

function windowStatePath(app) {
  return path.join(app.getPath("userData"), "window-state.json");
}

function createWindowState(app, screen) {
  const statePath = () => windowStatePath(app);

  const store = new WindowStateStore({
    readTextFile: () => {
      try {
        return fsSync.readFileSync(statePath(), "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") console.warn("[window-state] read failed:", error.message);
        return null;
      }
    },
    writeTextFile: async (text) => {
      const target = statePath();
      await fsp.mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.tmp`;
      await fsp.writeFile(temp, text, { encoding: "utf8" });
      await fsp.rename(temp, target);
    },
    reportFailure: (stage, error) =>
      console.warn(`[window-state] ${stage} failed:`, error?.message ?? error),
  });

  function resolveWindowPlacement() {
    const persisted = store.load();
    const placement = resolvePlacement({
      persisted,
      workAreas: screen.getAllDisplays().map((d) => d.workArea),
    });
    const fallback = { width: 1100, height: 760 };
    return {
      windowOptions: {
        ...(placement.bounds ?? fallback),
        minWidth: MIN_SIZE.width,
        minHeight: MIN_SIZE.height,
      },
      bounds: placement.bounds,
      persistedNormalBounds: persisted?.normalBounds ?? null,
      maximize: placement.maximize,
    };
  }

  function attach(window, initialBounds) {
    let normalBounds = initialBounds ?? window.getContentBounds();
    const persist = () => {
      if (window.isDestroyed()) return;
      if (!window.isMaximized() && !window.isFullScreen()) {
        normalBounds = window.getContentBounds();
      }
      store.note({ version: 1, normalBounds, isMaximized: window.isMaximized() });
    };
    for (const ev of ["resize", "move", "maximize", "unmaximize", "close"]) {
      window.on(ev, persist);
    }
  }

  function apply(window, placement) {
    if (placement.bounds) window.setContentBounds(placement.bounds);
    attach(window, placement.bounds ?? placement.persistedNormalBounds);
    if (placement.maximize) window.maximize();
  }

  return { resolveWindowPlacement, apply };
}

module.exports = { createWindowState, windowStatePath };
