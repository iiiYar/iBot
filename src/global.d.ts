import type { Project, Session, TokenUsage, ChatMessage, Workspace } from "./types/workspace";

export {};

// ── MCP types ─────────────────────────────────────────────────────────
export interface McpServerSpec {
  id?: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpServer extends Required<McpServerSpec> {
  id: string;
  connected: boolean;
}

export interface McpToolInfo {
  name: string;
  originalName: string;
  serverId: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ── Docker types ───────────────────────────────────────────────────────
export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
}

declare global {
  interface Window {
    botyar: {
      // ── Dialog & Shell ──────────────────────────────────────────────
      pickFolder(): Promise<string | null>;
      openPath(target: string): Promise<string>;

      // ── File System ────────────────────────────────────────────
      fsList(root: string, rel: string): Promise<Array<{ name: string; type: "dir" | "file"; size: number }>>;
      fsGlob(root: string, pattern: string): Promise<string[]>;
      fsGrep(root: string, pattern: string, glob: string): Promise<string[]>;
      fsRead(root: string, rel: string, startLine?: number, endLine?: number): Promise<string>;
      fsReadRaw(root: string, rel: string): Promise<string>;
      fsWrite(root: string, rel: string, content: string): Promise<{ written: number; path: string }>;
      fsReadImage(root: string, rel: string): Promise<string>;

      // ── Process ───────────────────────────────────────────────────
      runCommand(root: string, command: string): Promise<{ code: number; stdout: string; stderr: string }>;

      // ── Network ───────────────────────────────────────────────────
      netFetch(url: string): Promise<{ content?: string; error?: string; url?: string }>;
      netSearch(term: string): Promise<{ results: Array<{ title: string; url: string; snippet: string }>; error?: string }>;

      // ── Secrets ───────────────────────────────────────────────────
      secretsIsAvailable(): Promise<boolean>;
      secretsSet(key: string, value: string): Promise<boolean>;
      secretsGet(key: string): Promise<string | null>;
      secretsDelete(key: string): Promise<boolean>;
      secretsHas(key: string): Promise<boolean>;

      // ── Skills ─────────────────────────────────────────────────────
      skillsList(root: string): Promise<Array<{ name: string; description: string; path: string; source: string }>>;

      // ── Projects ──────────────────────────────────────────────────
      projectsList(): Promise<Project[]>;
      projectsGet(id: string): Promise<Project | null>;
      projectsSave(input: Partial<Project> & { name: string; rootPath: string }): Promise<Project>;
      projectsDelete(id: string): Promise<boolean>;

      // ── Sessions ─────────────────────────────────────────────────
      sessionsList(projectId?: string): Promise<Session[]>;
      sessionsGet(id: string): Promise<Session | null>;
      sessionsSave(session: Partial<Session> & { title: string; model: string }): Promise<Session>;
      sessionsDelete(id: string): Promise<boolean>;

      // ── MCP (Phase 3+4) ─────────────────────────────────────────────
      mcpListServers(): Promise<McpServer[]>;
      mcpSaveServer(input: McpServerSpec): Promise<McpServer>;
      mcpDeleteServer(id: string): Promise<boolean>;
      mcpConnect(id: string): Promise<{ id: string; connected: boolean; pid?: number }>;
      mcpDisconnect(id: string): Promise<{ id: string; connected: boolean }>;
      mcpListTools(id: string): Promise<McpToolInfo[]>;
      mcpListAllTools(): Promise<McpToolInfo[]>;
      mcpCallTool(serverId: string, name: string, args: Record<string, unknown>): Promise<string>;
    };
  }
}
