/**
 * secrets-store.cjs
 * Secure storage for sensitive values (API keys, tokens) using Electron safeStorage.
 * On Windows: DPAPI encryption. On macOS: Keychain. On Linux: libsecret or fallback.
 * Inspired by source/electron-main/secrets/secret-store.ts
 */
"use strict";

const { safeStorage, app } = require("electron");
const path = require("node:path");
const fs   = require("node:fs");
const fsp  = require("node:fs/promises");

const SECRETS_FILE_NAME = "ibot-secrets.enc";

function secretsFilePath() {
  return path.join(app.getPath("userData"), SECRETS_FILE_NAME);
}

/**
 * Reads the raw encrypted store from disk.
 * Returns a plain object { key: encryptedBase64 } or {}.
 */
function readEncryptedStore() {
  try {
    const raw = fs.readFileSync(secretsFilePath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Writes the encrypted store atomically.
 */
async function writeEncryptedStore(store) {
  const target = secretsFilePath();
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(store, null, 2), { encoding: "utf-8", mode: 0o600 });
  await fsp.rename(tmp, target);
}

/**
 * Returns true if safeStorage encryption is available on this platform.
 * Falls back to a warning-level base64 obfuscation when unavailable (dev mode only).
 */
function isEncryptionAvailable() {
  return safeStorage.isEncryptionAvailable();
}

/** Encrypt a plaintext string. Returns base64 string. */
function encrypt(plaintext) {
  if (!isEncryptionAvailable()) {
    // Fallback: base64 only (not secure — warn in console)
    console.warn("[secrets-store] safeStorage unavailable — using base64 fallback (not secure)");
    return Buffer.from(plaintext, "utf-8").toString("base64");
  }
  const buf = safeStorage.encryptString(plaintext);
  return buf.toString("base64");
}

/** Decrypt a base64 string back to plaintext. */
function decrypt(base64) {
  if (!isEncryptionAvailable()) {
    return Buffer.from(base64, "base64").toString("utf-8");
  }
  const buf = Buffer.from(base64, "base64");
  return safeStorage.decryptString(buf);
}

// ───────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────

/**
 * Set a secret value. Key is a logical name like "openrouter_api_key".
 */
async function setSecret(key, value) {
  const store = readEncryptedStore();
  store[key] = encrypt(value);
  await writeEncryptedStore(store);
}

/**
 * Get a decrypted secret. Returns null if not found.
 */
function getSecret(key) {
  const store = readEncryptedStore();
  if (!store[key]) return null;
  try {
    return decrypt(store[key]);
  } catch (err) {
    console.error(`[secrets-store] failed to decrypt key "${key}":`, err);
    return null;
  }
}

/**
 * Delete a secret.
 */
async function deleteSecret(key) {
  const store = readEncryptedStore();
  delete store[key];
  await writeEncryptedStore(store);
}

/**
 * List all stored secret keys (names only, not values).
 */
function listSecretKeys() {
  return Object.keys(readEncryptedStore());
}

/**
 * Migrate an existing plaintext API key from the old localStorage-based approach.
 * Call once on first startup — checks if a plain value exists in userData/config.json.
 */
async function migrateFromLegacy() {
  const legacyPath = path.join(app.getPath("userData"), "config.json");
  if (!fs.existsSync(legacyPath)) return;
  try {
    const config = JSON.parse(fs.readFileSync(legacyPath, "utf-8"));
    if (config.openrouterKey && !getSecret("openrouter_api_key")) {
      await setSecret("openrouter_api_key", config.openrouterKey);
      // Remove from legacy file
      delete config.openrouterKey;
      fs.writeFileSync(legacyPath, JSON.stringify(config, null, 2), "utf-8");
      console.log("[secrets-store] Migrated legacy API key to safeStorage.");
    }
  } catch (err) {
    console.warn("[secrets-store] Legacy migration failed:", err);
  }
}

module.exports = {
  setSecret,
  getSecret,
  deleteSecret,
  listSecretKeys,
  isEncryptionAvailable,
  migrateFromLegacy,
};
