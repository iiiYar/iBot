/**
 * window-state-persistence.cjs
 * Ported & adapted from source/electron-main/window-state-persistence.ts
 * Integrates WindowStateStore with the live BrowserWindow and screen module.
 */
"use strict";

const { readFileSync, promises: fsp } = require("node:fs");
const path = require("node:path");
const { IBOT_MIN_WINDOW_SIZE, resolveWindowLaunchPlacement, WindowStateStore } = require("./window-state-store.cjs");

function windowStatePath(app) {
  return path.join(app.getPath("userData"), "window-state.json");
}

function errorCode(err) {
  if (!(err instanceof Error)) return typeof err;
  return ("code" in err && typeof err.code === "string" ? err.code : null) ?? err.name;
}

/**
 * @param {{ app, screen, onWarning }} deps
 *   - app     : Electron app object
 *   - screen  : Electron screen module
 *   - onWarning: (msg: string) => void
 */
function createWindowStatePersistence({ app, screen, onWarning }) {
  const statePath = () => windowStatePath(app);

  const store = new WindowStateStore({
    readTextFile() {
      try {
        return readFileSync(statePath(), "utf-8");
      } catch (err) {
        if (err?.code !== "ENOENT") onWarning(`window-state read failed: ${errorCode(err)}`);
        return null;
      }
    },
    async writeTextFile(text) {
      const target = statePath();
      await fsp.mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, text, { encoding: "utf-8", mode: 0o600 });
      await fsp.rename(tmp, target);
    },
    reportFailure(stage, err) {
      onWarning(`window-state ${stage} failed: ${errorCode(err)}`);
    },
  });

  /** Attach resize/move/maximize/close listeners to persist state. */
  function attachPersistence(win, initialBounds) {
    let normalBounds = initialBounds ?? win.getContentBounds();

    const isPlainWindowed = () => {
      if (win.isMaximized() || win.isFullScreen()) return false;
      const b = win.getBounds(), n = win.getNormalBounds();
      return b.x === n.x && b.y === n.y && b.width === n.width && b.height === n.height;
    };

    const persist = () => {
      if (win.isDestroyed()) return;
      if (isPlainWindowed()) normalBounds = win.getContentBounds();
      store.note({ version: 1, normalBounds, isMaximized: win.isMaximized() });
    };

    win.on("resize",    persist);
    win.on("move",      persist);
    win.on("maximize",  persist);
    win.on("unmaximize",persist);
    win.on("close",     persist);
  }

  /** Returns persisted placement options to pass into BrowserWindow constructor. */
  function resolvePlacement() {
    const persisted = store.load();
    const workAreas = screen.getAllDisplays().map((d) => d.workArea);
    const placement = resolveWindowLaunchPlacement({ persisted, workAreas });

    const fallback = { width: 1200, height: 800 };
    return {
      windowOptions: {
        ...(placement.bounds ?? fallback),
        minWidth:  IBOT_MIN_WINDOW_SIZE.width,
        minHeight: IBOT_MIN_WINDOW_SIZE.height,
      },
      bounds: placement.bounds,
      persistedNormalBounds: persisted?.normalBounds ?? null,
      maximize: placement.maximize,
    };
  }

  /** Apply a resolved placement to a newly created BrowserWindow. */
  function applyPlacement(win, placement) {
    if (placement.bounds) win.setContentBounds(placement.bounds);
    attachPersistence(win, placement.bounds ?? placement.persistedNormalBounds);
    if (placement.maximize) win.maximize();
  }

  return { store, resolvePlacement, applyPlacement, attachPersistence };
}

module.exports = { createWindowStatePersistence, windowStatePath };
