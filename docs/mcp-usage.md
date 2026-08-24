# دليل استخدام MCP في iBot

## ما هو MCP؟

Model Context Protocol (MCP) يتيح لـ iBot التحدث مع خوادم أدوات خارجية عبر stdin/stdout.
كل خادم يُعرِّف مجموعة أدوات يستطيع الـ agent استخدامها تلقائياً.

---

## 1 — إضافة خادم MCP

```ts
// في أي مكان داخل الـ renderer (مثل صفحة الإعدادات)
const server = await window.botyar.mcpSaveServer({
  name: "filesystem",          // اسم يظهر في الواجهة
  command: "npx",              // الأمر المطلوب تشغيله
  args: [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "C:/myproject",            // المجلد الذي يُتاح للخادم
  ],
  // cwd?: string              // مجلد العمل (اختياري)
  // env?: Record<string,string>  // متغيرات بيئة إضافية (اختيارية)
});
// server.id  — UUID للخادم، احفظه
```

---

## 2 — الاتصال بالخادم

```ts
const info = await window.botyar.mcpConnect(server.id);
// info = { id, connected: true, pid: 12345 }
```

> يحدث handshake تلقائياً:
> `initialize` → `notifications/initialized` → جاهز

---

## 3 — عرض الأدوات المتاحة

```ts
// أدوات خادم واحد
const tools = await window.botyar.mcpListTools(server.id);

// أدوات جميع الخوادم المتصلة
const allTools = await window.botyar.mcpListAllTools();
```

كل أداة تأتي بالشكل:

```ts
{
  name: "mcp_a1b2c3d4_read_file",  // اسم مؤهَّل للـ agent
  originalName: "read_file",       // الاسم الأصلي عند الخادم
  serverId: "<uuid>",
  description: "Read a file from the filesystem",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
}
```

---

## 4 — تمرير الأدوات للـ Agent

عند بناء `AgentRunner` مرِّر الأدوات عبر الخاصية `mcpTools`:

```ts
import { AgentRunner } from "./agent";

const mcpTools = await window.botyar.mcpListAllTools();

const runner = new AgentRunner(
  config,
  projectRoot,
  planMode,
  autoApprove,
  hooks,
  history,
  skills,
  mcpTools,   // ← الإضافة الجديدة في Phase 4A
);
```

بعد ذلك الـ agent يستدعي أدوات `mcp_*` تلقائياً كأي أداة عادية.

---

## 5 — استدعاء أداة يدوياً (اختياري)

```ts
const result = await window.botyar.mcpCallTool(
  server.id,
  "read_file",          // originalName
  { path: "/README.md" }
);
console.log(result); // نص مسطَّح من content blocks
```

---

## 6 — قطع الاتصال وحذف الخادم

```ts
await window.botyar.mcpDisconnect(server.id);
await window.botyar.mcpDeleteServer(server.id);
```

---

## 7 — مثال كامل (خادم filesystem)

```ts
async function setupFilesystemMcp(projectPath: string) {
  // 1. أضف
  const srv = await window.botyar.mcpSaveServer({
    name: "filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", projectPath],
  });

  // 2. اتصل
  await window.botyar.mcpConnect(srv.id);

  // 3. اعرض الأدوات
  const tools = await window.botyar.mcpListAllTools();
  console.log("MCP tools available:", tools.map((t) => t.name));

  // 4. مرِّر للـ agent
  return { serverId: srv.id, mcpTools: tools };
}
```

---

## ملف الإعداد

تُحفظ قائمة الخوادم في:

```
%APPDATA%/iBot/mcp-servers.json
```

مثال:

```json
{
  "servers": [
    {
      "id": "a1b2c3d4-...",
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/myproject"],
      "cwd": "",
      "env": {},
      "enabled": true
    }
  ]
}
```

---

## خوادم MCP شائعة

| الخادم | الأمر |
|--------|-------|
| Filesystem | `npx -y @modelcontextprotocol/server-filesystem <path>` |
| Git | `npx -y @modelcontextprotocol/server-git` |
| Fetch (web) | `npx -y @modelcontextprotocol/server-fetch` |
| Brave Search | `npx -y @modelcontextprotocol/server-brave-search` |
| SQLite | `npx -y @modelcontextprotocol/server-sqlite <db_path>` |
| Puppeteer | `npx -y @modelcontextprotocol/server-puppeteer` |
