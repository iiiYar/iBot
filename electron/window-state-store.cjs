/**
 * window-state-store.cjs
 * Ported & adapted from source/electron-main/window-state-store.ts
 * Handles serialization, validation, and smart placement of window bounds.
 */
"use strict";

const { z } = require("zod");

const IBOT_MIN_WINDOW_SIZE = { width: 800, height: 600 };

const coordinateSchema = z.number().finite().int();
const sizeSchema = coordinateSchema.positive();
const windowStateSchema = z.object({
  version: z.literal(1),
  normalBounds: z.object({
    x: coordinateSchema,
    y: coordinateSchema,
    width: sizeSchema,
    height: sizeSchema,
  }),
  isMaximized: z.boolean(),
});

function parsePersistedWindowState(value) {
  const parsed = windowStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Given persisted state and available work areas (from all monitors),
 * returns the best launch placement — clamped and validated.
 */
function resolveWindowLaunchPlacement({ persisted, workAreas }) {
  if (!persisted || workAreas.length === 0) return { bounds: null, maximize: false };

  let best = null;
  for (const workArea of workAreas) {
    const overlapW = Math.max(
      0,
      Math.min(persisted.normalBounds.x + persisted.normalBounds.width, workArea.x + workArea.width)
        - Math.max(persisted.normalBounds.x, workArea.x)
    );
    const overlapH = Math.max(
      0,
      Math.min(persisted.normalBounds.y + persisted.normalBounds.height, workArea.y + workArea.height)
        - Math.max(persisted.normalBounds.y, workArea.y)
    );
    const area = overlapW * overlapH;
    if (!best || area > best.area) best = { workArea, overlapW, overlapH, area };
  }

  if (
    !best ||
    best.overlapW < 100 ||
    best.overlapH < 40 ||
    best.workArea.width < IBOT_MIN_WINDOW_SIZE.width ||
    best.workArea.height < IBOT_MIN_WINDOW_SIZE.height
  ) {
    return { bounds: null, maximize: persisted.isMaximized };
  }

  const width  = Math.min(Math.max(persisted.normalBounds.width,  IBOT_MIN_WINDOW_SIZE.width),  best.workArea.width);
  const height = Math.min(Math.max(persisted.normalBounds.height, IBOT_MIN_WINDOW_SIZE.height), best.workArea.height);
  const x = Math.min(Math.max(persisted.normalBounds.x, best.workArea.x), best.workArea.x + best.workArea.width  - width);
  const y = Math.min(Math.max(persisted.normalBounds.y, best.workArea.y), best.workArea.y + best.workArea.height - height);

  return { bounds: { x, y, width, height }, maximize: persisted.isMaximized };
}

class WindowStateStore {
  #writeInFlight = false;
  #trailingText   = null;
  #io;

  constructor(io) { this.#io = io; }

  load() {
    const text = this.#io.readTextFile();
    if (!text) return null;
    try {
      const state = parsePersistedWindowState(JSON.parse(text));
      if (!state) this.#io.reportFailure("parse", new Error("schema validation failed"));
      return state;
    } catch (err) {
      this.#io.reportFailure("parse", err);
      return null;
    }
  }

  note(state) {
    const text = JSON.stringify(state, null, 2);
    if (this.#writeInFlight) { this.#trailingText = text; return; }
    this.#startWrite(text);
  }

  #startWrite(text) {
    this.#writeInFlight = true;
    this.#io.writeTextFile(text)
      .catch((err) => this.#io.reportFailure("write", err))
      .finally(() => {
        this.#writeInFlight = false;
        const trailing = this.#trailingText;
        this.#trailingText = null;
        if (trailing) this.#startWrite(trailing);
      });
  }
}

module.exports = {
  IBOT_MIN_WINDOW_SIZE,
  parsePersistedWindowState,
  resolveWindowLaunchPlacement,
  WindowStateStore,
};
