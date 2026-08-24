const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("botyar", {
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  openPath: (target) => ipcRenderer.invoke("shell:openPath", target),
  fsList: (root, rel) => ipcRenderer.invoke("fs:list", root, rel),
  fsGlob: (root, pattern) => ipcRenderer.invoke("fs:glob", root, pattern),
  fsGrep: (root, pattern, glob) => ipcRenderer.invoke("fs:grep", root, pattern, glob),
  fsRead: (root, rel, startLine, endLine) => ipcRenderer.invoke("fs:read", root, rel, startLine, endLine),
  fsReadRaw: (root, rel) => ipcRenderer.invoke("fs:readRaw", root, rel),
  fsWrite: (root, rel, content) => ipcRenderer.invoke("fs:write", root, rel, content),
  runCommand: (root, command) => ipcRenderer.invoke("proc:run", root, command),
  netFetch: (url) => ipcRenderer.invoke("net:fetch", url),
  netSearch: (term) => ipcRenderer.invoke("net:search", term),
  fsReadImage: (root, rel) => ipcRenderer.invoke("fs:readImage", root, rel),
  skillsList: (root) => ipcRenderer.invoke("skills:list", root),
  sessionsSave: (session) => ipcRenderer.invoke("sessions:save", session),
  sessionsList: () => ipcRenderer.invoke("sessions:list"),
  sessionsDelete: (id) => ipcRenderer.invoke("sessions:delete", id),
});
