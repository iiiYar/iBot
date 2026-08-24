export {};

declare global {
  interface Window {
    botyar: {
      pickFolder(): Promise<string | null>;
      openPath(target: string): Promise<string>;
      fsList(root: string, rel: string): Promise<Array<{ name: string; type: "dir" | "file"; size: number }>>;
      fsGlob(root: string, pattern: string): Promise<string[]>;
      fsGrep(root: string, pattern: string, glob: string): Promise<string[]>;
      fsRead(root: string, rel: string, startLine?: number, endLine?: number): Promise<string>;
      fsReadRaw(root: string, rel: string): Promise<string>;
      fsWrite(root: string, rel: string, content: string): Promise<{ written: number; path: string }>;
      runCommand(root: string, command: string): Promise<{ code: number; stdout: string; stderr: string }>;
      netFetch(url: string): Promise<{ content?: string; error?: string; url?: string }>;
      netSearch(term: string): Promise<{ results: Array<{ title: string; url: string; snippet: string }>; error?: string }>;
      fsReadImage(root: string, rel: string): Promise<string>;
      skillsList(root: string): Promise<Array<{ name: string; description: string; path: string; source: string }>>;
      sessionsSave(session: unknown): Promise<boolean>;
      sessionsList(): Promise<Array<Record<string, unknown>>>;
      sessionsDelete(id: string): Promise<boolean>;
    };
  }
}
