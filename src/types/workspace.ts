// ── Token & Message types ──────────────────────────────────────────
export type TokenUsage = {
  prompt:     number;
  completion: number;
  total:      number;
};

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ChatMessage = {
  id:        string;
  role:      MessageRole;
  content:   string;
  createdAt: number;
  // Optional: attach token count per message for live counter
  tokens?:   number;
};

// ── Session ────────────────────────────────────────────────────────
export type Session = {
  id:          string;
  projectId:   string | null;
  title:       string;
  model:       string;
  messages:    ChatMessage[];
  tokenUsage:  TokenUsage;
  createdAt:   number;
  updatedAt:   number;
};

// ── Project ────────────────────────────────────────────────────────
export type Project = {
  id:            string;
  name:          string;
  rootPath:      string;
  lastSessionId: string | null;
  createdAt:     number;
  updatedAt:     number;
};

// ── Workspace = current project + current session ──────────────────
export type Workspace = {
  project: Project | null;
  session: Session | null;
};
