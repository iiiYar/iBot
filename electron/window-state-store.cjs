"use strict";

const MIN_SIZE = { width: 512, height: 520 };

function parseState(value) {
  if (!value || value.version !== 1) return null;
  const b = value.normalBounds;
  if (!b) return null;
  if (!Number.isInteger(b.x) || !Number.isInteger(b.y)) return null;
  if (!Number.isInteger(b.width) || !Number.isInteger(b.height)) return null;
  if (b.width <= 0 || b.height <= 0) return null;
  if (typeof value.isMaximized !== "boolean") return null;
  return { version: 1, normalBounds: b, isMaximized: value.isMaximized };
}

function resolvePlacement({ persisted, workAreas }) {
  if (!persisted || workAreas.length === 0) return { bounds: null, maximize: false };

  let best = null;
  for (const workArea of workAreas) {
    const overlapWidth = Math.max(
      0,
      Math.min(persisted.normalBounds.x + persisted.normalBounds.width, workArea.x + workArea.width) -
        Math.max(persisted.normalBounds.x, workArea.x)
    );
    const overlapHeight = Math.max(
      0,
      Math.min(persisted.normalBounds.y + persisted.normalBounds.height, workArea.y + workArea.height) -
        Math.max(persisted.normalBounds.y, workArea.y)
    );
    const area = overlapWidth * overlapHeight;
    if (!best || area > best.area) best = { workArea, overlapWidth, overlapHeight, area };
  }

  if (!best || best.overlapWidth < 100 || best.overlapHeight < 40) {
    return { bounds: null, maximize: persisted.isMaximized };
  }

  const width = Math.min(Math.max(persisted.normalBounds.width, MIN_SIZE.width), best.workArea.width);
  const height = Math.min(Math.max(persisted.normalBounds.height, MIN_SIZE.height), best.workArea.height);
  const x = Math.min(
    Math.max(persisted.normalBounds.x, best.workArea.x),
    best.workArea.x + best.workArea.width - width
  );
  const y = Math.min(
    Math.max(persisted.normalBounds.y, best.workArea.y),
    best.workArea.y + best.workArea.height - height
  );
  return { bounds: { x, y, width, height }, maximize: persisted.isMaximized };
}

class WindowStateStore {
  constructor(io) {
    this.io = io;
    this.writeInFlight = false;
    this.trailingText = null;
  }

  load() {
    const text = this.io.readTextFile();
    if (text == null) return null;
    try {
      return parseState(JSON.parse(text));
    } catch (error) {
      this.io.reportFailure("parse", error);
      return null;
    }
  }

  note(state) {
    const text = JSON.stringify(state, null, 2);
    if (this.writeInFlight) { this.trailingText = text; return; }
    this._startWrite(text);
  }

  _startWrite(text) {
    this.writeInFlight = true;
    Promise.resolve(this.io.writeTextFile(text))
      .catch((error) => this.io.reportFailure("write", error))
      .finally(() => {
        this.writeInFlight = false;
        const next = this.trailingText;
        this.trailingText = null;
        if (next != null) this._startWrite(next);
      });
  }
}

module.exports = { MIN_SIZE, parseState, resolvePlacement, WindowStateStore };
