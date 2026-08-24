const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { spawn } = require("node:child_process");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1020,
    minHeight: 640,
    backgroundColor: "#0d1117",
    title: "Bot Yar",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.BOTYAR_DEV === "1") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

function resolveInside(root, rel) {
  const abs = path.resolve(root, rel || ".");
  const normalizedRoot = path.resolve(root);
  if (abs !== normalizedRoot && !abs.startsWith(normalizedRoot + path.sep)) {
    throw new Error("Path escapes the project folder");
  }
  return abs;
}

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<h1[^>]*>/gi, "\n\n# ").replace(/<h2[^>]*>/gi, "\n\n## ").replace(/<h3[^>]*>/gi, "\n\n### ")
    .replace(/<h4[^>]*>/gi, "\n\n#### ").replace(/<h5[^>]*>/gi, "\n\n##### ").replace(/<h6[^>]*>/gi, "\n\n###### ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<pre[^>]*>/gi, "\n```\n").replace(/<\/pre>/gi, "\n```\n")
    .replace(/<code[^>]*>/gi, "`").replace(/<\/code>/gi, "`")
    .replace(/<tr[^>]*>/gi, "\n").replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]*>/g, "");
  text = stripTags(text);
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function globToRegExp(pattern) {  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

async function walkFiles(root, current, out, depth = 0) {
  if (out.length >= 2000 || depth > 12) return;
  let entries;
  try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (out.length >= 2000) return;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === ".build") continue;
      await walkFiles(root, full, out, depth + 1);
    } else if (entry.isFile()) {
      out.push(path.relative(root, full));
    }
  }
}

app.whenReady().then(() => {
  ipcMain.handle("dialog:pickFolder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "اختر مجلد المشروع",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("shell:openPath", async (_e, target) => shell.openPath(target));

  ipcMain.handle("fs:list", async (_e, root, rel) => {
    const abs = resolveInside(root, rel);
    const entries = await fsp.readdir(abs, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
      let size = 0;
      try {
        if (entry.isFile()) size = (await fsp.stat(path.join(abs, entry.name))).size;
      } catch {}
      out.push({ name: entry.name, type: entry.isDirectory() ? "dir" : "file", size });
    }
    out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    return out.slice(0, 800);
  });

  ipcMain.handle("fs:glob", async (_e, root, pattern) => {
    const files = [];
    await walkFiles(root, root, files);
    const regex = globToRegExp(pattern);
    return files.filter((f) => regex.test(f.split(path.sep).join("/"))).slice(0, 300);
  });

  ipcMain.handle("fs:grep", (_e, root, pattern, glob) => {
    return new Promise((resolve) => {
      const globFilter = glob && glob !== "*" ? `| Where-Object { $_.FullName -like "*\\${glob.replace(/'/g, "''")}" }` : "";
      const safePattern = pattern.replace(/'/g, "''");
      const script = [
        `Get-ChildItem -LiteralPath '${root.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue`,
        `| Where-Object { $_.FullName -notmatch '\\\\(node_modules|\\.git|dist|\\.build)\\\\' }${globFilter}`,
        `| Select-String -Pattern '${safePattern}' -CaseSensitive:$false -ErrorAction SilentlyContinue`,
        `| Select-Object -First 200`,
        `| ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }`,
      ].join(" ");
      const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], { cwd: root, windowsHide: true });
      let stdout = "";
      child.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
      child.on("error", () => resolve([]));
      child.on("close", () => resolve(stdout.split("\n").filter(Boolean).slice(0, 200)));
    });
  });

  ipcMain.handle("fs:read", async (_e, root, rel, startLine, endLine) => {
    const abs = resolveInside(root, rel);
    const content = await fsp.readFile(abs, "utf8");
    const lines = content.split("\n");
    const start = Math.max(1, startLine ?? 1);
    const end = Math.min(lines.length, endLine ?? lines.length);
    const slice = lines.slice(start - 1, end);
    const numbered = slice.map((line, i) => `${String(start + i).padStart(6)}  ${line}`).join("\n");
    const truncated = end < lines.length ? `\n\n[Showing lines ${start}-${end} of ${lines.length}. Use start_line/end_line to read more.]` : "";
    return (numbered + truncated).slice(0, 256 * 1024);
  });

  ipcMain.handle("fs:readRaw", async (_e, root, rel) => {
    const abs = resolveInside(root, rel);
    return await fsp.readFile(abs, "utf8");
  });

  ipcMain.handle("fs:write", async (_e, root, rel, content) => {
    const abs = resolveInside(root, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, "utf8");
    return { written: content.length, path: abs };
  });

  ipcMain.handle("proc:run", (_e, root, command) => {
    return new Promise((resolve) => {
      if (!root || !fs.existsSync(root)) {
        resolve({ code: -1, stdout: "", stderr: "No project folder selected" });
        return;
      }
      const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
        cwd: root,
        windowsHide: true,
      });
      let stdout = "", stderr = "";
      const timer = setTimeout(() => {
        try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }); } catch {}
        resolve({ code: 124, stdout, stderr: (stderr + "\n[TIMEOUT after 120s]").trim() });
      }, 120000);
      child.stdout.on("data", (d) => { stdout += d.toString("utf8"); if (stdout.length > 60000) stdout = stdout.slice(-60000); });
      child.stderr.on("data", (d) => { stderr += d.toString("utf8"); if (stderr.length > 30000) stderr = stderr.slice(-30000); });
      child.on("error", (err) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(err) }); });
      child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
    });
  });

  ipcMain.handle("net:fetch", async (_e, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: `Invalid URL protocol: ${parsed.protocol} (must be http or https)` };
      }
      const host = parsed.hostname.toLowerCase();
      const display = parsed.port.length > 0 ? `${host}:${parsed.port}` : host;
      if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return { error: `Cannot fetch from localhost or private IP (${display}) because this tool runs from an isolated server.` };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BotYar/0.3" },
      });
      clearTimeout(timer);
      if (response.status !== 200) {
        return { error: `The URL returned a non-200 status code: ${response.status}` };
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/") && !contentType.includes("json") && !contentType.includes("xml") && !contentType.includes("javascript")) {
        return { error: `Unsupported content type: ${contentType}. This tool does not support fetching binary content, e.g. media or PDFs.` };
      }
      const html = await response.text();
      return { content: htmlToText(html).slice(0, 150000), url };
    } catch (error) {
      const message = error?.name === "AbortError" ? "Fetch timed out after 30 seconds" : String(error);
      return { error: message };
    }
  });

  ipcMain.handle("net:search", async (_e, searchTerm) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerm)}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BotYar/0.3" },
      });
      clearTimeout(timer);
      const html = await response.text();
      const results = [];
      const blockRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const snippets = [];
      let sm;
      while ((sm = snippetRegex.exec(html)) !== null) snippets.push(stripTags(sm[1]));
      let m;
      let index = 0;
      while ((m = blockRegex.exec(html)) !== null && results.length < 10) {
        let href = m[1];
        const decoded = /uddg=([^&]*)/.exec(href);
        if (decoded) href = decodeURIComponent(decoded[1]);
        results.push({ title: stripTags(m[2]), url: href, snippet: snippets[index] ?? "" });
        index++;
      }
      return { results };
    } catch (error) {
      return { results: [], error: String(error) };
    }
  });

  ipcMain.handle("fs:readImage", (_e, root, rel) => {
    const abs = resolveInside(root, rel);
    const ext = path.extname(abs).toLowerCase();
    const mimes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp" };
    if (!mimes[ext]) throw new Error(`Not a supported image type: ${ext}`);
    const stat = fs.statSync(abs);
    if (stat.size > 5 * 1024 * 1024) throw new Error("Image larger than 5MB");
    const b64 = fs.readFileSync(abs).toString("base64");
    return `data:${mimes[ext]};base64,${b64}`;
  });

  const skillsDir = () => path.join(app.getPath("userData"), "skills");
  const sessionsDir = () => path.join(app.getPath("userData"), "sessions");

  function ensureSeedSkills() {
    const dir = skillsDir();
    fs.mkdirSync(dir, { recursive: true });
    const defaults = {
      "review.md": "---\nname: review\ndescription: Review recent changes for bugs, security issues, and quality problems.\n---\n# Code Review\n\nReview the most recent changes in this project:\n\n1. Run `git diff` and `git status` to see what changed (or read the files the user mentioned).\n2. Examine every changed file for: bugs, edge cases, security issues, performance problems, and readability.\n3. Report findings grouped by severity: Critical / Warning / Suggestion.\n4. For each finding, cite the file and line, explain the issue, and show a concrete fix.\n5. Do NOT change any files unless the user asks you to apply the fixes.\n",
      "goal.md": "---\nname: goal\ndescription: Define a clear goal and step-by-step plan for a task, then save it as the todo list.\n---\n# Goal Setting\n\nThe user will describe an objective. Your job:\n\n1. Restate the goal in one precise sentence and confirm success criteria.\n2. Break it into concrete, verifiable steps (3-8 steps).\n3. Save the steps with the update_todos tool (all pending).\n4. Identify risks, unknowns, or missing information before starting.\n5. Ask the user to confirm the plan before executing.\n",
      "test.md": "---\nname: test\ndescription: Run the project tests, diagnose failures, and fix them.\n---\n# Test & Fix\n\n1. Detect the test setup (package.json scripts, pytest, go test...).\n2. Run the test suite with the Shell tool.\n3. For each failure: read the failing code, identify the root cause, and fix it minimally.\n4. Re-run until green. Report a summary of what was broken and what you changed.\n",
      "commit.md": "---\nname: commit\ndescription: Create a clean git commit for the current changes with a good message.\n---\n# Commit\n\n1. Run `git status` and `git diff` to understand the changes.\n2. Group changes logically if they cover unrelated concerns (ask the user if unsure).\n3. Write a conventional commit message (feat/fix/refactor/chore: short imperative summary + body explaining why).\n4. Stage and commit. Never push unless asked.\n",
      "explain.md": "---\nname: explain\ndescription: Explain a file, folder, or concept from this project in depth.\n---\n# Explain\n\nThe user will name a file, folder, or concept.\n\n1. Read the relevant code thoroughly (Read/Glob/Grep).\n2. Explain top-down: purpose, architecture, data flow, then key implementation details.\n3. Use short code excerpts as evidence. Adapt depth to the user's expertise.\n",
    };
    for (const [name, content] of Object.entries(defaults)) {
      const target = path.join(dir, name);
      if (!fs.existsSync(target)) fs.writeFileSync(target, content, "utf8");
    }
  }
  ensureSeedSkills();

  function parseSkillFile(fullPath) {
    try {
      const text = fs.readFileSync(fullPath, "utf8");
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      const base = path.basename(fullPath).replace(/\.md$/i, "");
      let name = base, description = "";
      if (fm) {
        name = (/^name:\s*(.+)$/m.exec(fm[1]) || [])[1]?.trim() || base;
        description = (/^description:\s*(.+)$/m.exec(fm[1]) || [])[1]?.trim() || "";
      }
      return { name, description, path: fullPath, source: fullPath.startsWith(skillsDir()) ? "global" : "project" };
    } catch { return null; }
  }

  ipcMain.handle("skills:list", (_e, projectRoot) => {
    const out = [];
    const dirs = [skillsDir()];
    if (projectRoot && fs.existsSync(projectRoot)) dirs.push(path.join(projectRoot, ".botyar", "skills"));
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.toLowerCase().endsWith(".md")) continue;
        const skill = parseSkillFile(path.join(dir, file));
        if (skill) out.push(skill);
      }
    }
    return out;
  });

  ipcMain.handle("sessions:save", (_e, session) => {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    const file = path.join(sessionsDir(), `${session.id}.json`);
    fs.writeFileSync(file, JSON.stringify(session), "utf8");
    return true;
  });

  ipcMain.handle("sessions:list", () => {
    if (!fs.existsSync(sessionsDir())) return [];
    const out = [];
    for (const file of fs.readdirSync(sessionsDir())) {
      if (!file.endsWith(".json")) continue;
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(sessionsDir(), file), "utf8")));
      } catch {}
    }
    return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  });

  ipcMain.handle("sessions:delete", (_e, id) => {
    try { fs.rmSync(path.join(sessionsDir(), `${id}.json`), { force: true }); } catch {}
    return true;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
