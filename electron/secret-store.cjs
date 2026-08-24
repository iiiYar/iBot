"use strict";

/**
 * secret-store — stores sensitive values (API keys, tokens) encrypted with
 * Windows DPAPI via Electron safeStorage. Falls back gracefully if safeStorage
 * is unavailable (dev mode, CI, etc).
 */

const fsSync = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

let safeStorageRef = null;
try {
  safeStorageRef = require("electron").safeStorage;
} catch {
  // In test / non-electron environments
}

function secretsPath(app) {
  return path.join(app.getPath("userData"), "secrets.enc.json");
}

function createSecretStore(app) {
  const file = secretsPath(app);

  function readAll() {
    try {
      return JSON.parse(fsSync.readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  }

  async function writeAll(data) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
    await fsp.rename(temp, file);
  }

  const ss = safeStorageRef;
  const canEncrypt = () => ss?.isEncryptionAvailable() ?? false;

  return {
    /** Returns true if OS-level encryption (DPAPI on Windows) is available */
    isAvailable: canEncrypt,

    /** Encrypt and persist a key-value pair */
    async set(key, value) {
      const data = readAll();
      if (canEncrypt()) {
        data[key] = {
          enc: true,
          v: ss.encryptString(String(value)).toString("base64"),
        };
      } else {
        // Fallback: plain-text with a warning marker (dev/CI only)
        console.warn("[secret-store] safeStorage unavailable — storing plain text");
        data[key] = { enc: false, v: String(value) };
      }
      await writeAll(data);
    },

    /** Decrypt and return a stored value, or null if not found */
    get(key) {
      const entry = readAll()[key];
      if (!entry) return null;
      if (entry.enc) {
        if (!canEncrypt()) {
          console.warn("[secret-store] safeStorage unavailable — cannot decrypt");
          return null;
        }
        return ss.decryptString(Buffer.from(entry.v, "base64"));
      }
      return entry.v;
    },

    /** Remove a key */
    async delete(key) {
      const data = readAll();
      delete data[key];
      await writeAll(data);
    },

    /** Check if a key exists (without decrypting) */
    has(key) {
      return Boolean(readAll()[key]);
    },
  };
}

module.exports = { createSecretStore, secretsPath };
