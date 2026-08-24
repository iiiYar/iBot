import React, { useCallback, useEffect, useState } from "react";
import type { SkillInfo } from "../agent";
import type { Session } from "../types/workspace";
import type { TodoItem } from "../agent";
import { STRINGS, type Lang } from "../i18n";

type TreeNode = { name: string; type: "dir" | "file"; size: number };

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "📘", tsx: "⚛️", js: "📙", jsx: "⚛️",
    css: "🎨", json: "📋", md: "📝", py: "🐍",
    sh: "🔧", env: "🔑", gitignore: "🙈",
  };
  return <span style={{ fontSize: 11, opacity: .7 }}>{map[ext ?? ""] ?? "📄"}</span>;
}

function ExpandedDir({
  root, rel, depth, expanded, toggle, refreshKey,
}: {
  root: string; rel: string; depth: number;
  expanded: Set<string>; toggle: (r: string) => void; refreshKey: number;
}) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  useEffect(() => {
    void window.botyar.fsList(root, rel).then(setNodes).catch(() => setNodes([]));
  }, [root, rel, refreshKey]);
  if (nodes === null)
    return <div className="file-tree-item" style={{ paddingInlineStart: 10 + depth * 14 }}>
      <div className="skeleton" style={{ width: 80, height: 10, borderRadius: 4 }} />
    </div>;
  const render = (items: TreeNode[], parentRel: string, d: number): React.ReactNode =>
    items.map((node) => {
      const childRel = `${parentRel}/${node.name}`;
      if (node.type === "dir") {
        const isOpen = expanded.has(childRel);
        return (
          <div key={childRel}>
            <div className="file-tree-item" style={{ paddingInlineStart: 10 + d * 14 }} onClick={() => toggle(childRel)}>
              <span className="file-tree-item-icon">{isOpen ? "▾" : "▸"}</span>
              <span style={{ opacity: .85 }}>📁</span>
              <span>{node.name}</span>
            </div>
            {isOpen && (
              <ExpandedDir root={root} rel={childRel} depth={d + 1}
                expanded={expanded} toggle={toggle} refreshKey={refreshKey} />
            )}
          </div>
        );
      }
      return (
        <div key={childRel} className="file-tree-item" style={{ paddingInlineStart: 24 + d * 14 }}>
          <FileIcon name={node.name} />
          <span>{node.name}</span>
        </div>
      );
    });
  return <>{render(nodes, rel, depth)}</>;
}

function FileTree({ root, refreshKey, emptyText }: { root: string; refreshKey: number; emptyText: string }) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    void window.botyar.fsList(root, ".").then(setTree).catch(() => setTree([]));
  }, [root, refreshKey]);
  const toggle = useCallback((rel: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel); else next.add(rel);
      return next;
    });
  }, []);
  const renderNodes = (nodes: TreeNode[], parentRel: string, depth: number): React.ReactNode =>
    nodes.map((node) => {
      const rel = parentRel === "." ? node.name : `${parentRel}/${node.name}`;
      if (node.type === "dir") {
        const isOpen = expanded.has(rel);
        return (
          <div key={rel}>
            <div className="file-tree-item" style={{ paddingInlineStart: 10 + depth * 14 }} onClick={() => toggle(rel)}>
              <span className="file-tree-item-icon">{isOpen ? "▾" : "▸"}</span>
              <span style={{ opacity: .85 }}>📁</span>
              <span>{node.name}</span>
            </div>
            {isOpen && (
              <ExpandedDir root={root} rel={rel} depth={depth + 1}
                expanded={expanded} toggle={toggle} refreshKey={refreshKey} />
            )}
          </div>
        );
      }
      return (
        <div key={rel} className="file-tree-item" style={{ paddingInlineStart: 24 + depth * 14 }}>
          <FileIcon name={node.name} />
          <span>{node.name}</span>
        </div>
      );
    });
  if (!tree.length) return <div className="empty-state">{emptyText}</div>;
  return <div>{renderNodes(tree, ".", 0)}</div>;
}

export interface SidebarProps {
  lang: Lang;
  projectRoot: string | null;
  sessions: Session[];
  activeSessionId: string;
  getLiveSession: (id: string) => { running: boolean; todos: TodoItem[]; projectRoot: string | null };
  skills: SkillInfo[];
  treeRefresh: number;
  mcpToolCount: number;
  onNewSession: () => void;
  onPickFolder: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: (tab?: "general" | "mcp" | "docker") => void;
  onSkillClick: (name: string) => void;
  onLangToggle: () => void;
}

export function Sidebar({
  lang, projectRoot, sessions, activeSessionId,
  getLiveSession, skills, treeRefresh, mcpToolCount,
  onNewSession, onPickFolder, onSwitchSession, onDeleteSession,
  onOpenSettings, onSkillClick, onLangToggle,
}: SidebarProps) {
  const t = STRINGS[lang];
  const [view, setView] = useState<"sessions" | "files" | "todos" | "skills">("sessions");
  const activeLive = getLiveSession(activeSessionId);
  const hasRunning = sessions.some((s) => getLiveSession(s.id).running);
  const hasTodoActive = activeLive.todos.some((x) => x.status === "in_progress");

  return (
    <aside className="sidebar">
      {/* ── Brand ── */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">◈</div>
        <span className="sidebar-brand-name">{t.appName}</span>
        <span className="sidebar-brand-version">v0.7</span>
      </div>

      {/* ── Quick actions ── */}
      <div style={{ padding: "8px 12px", display: "flex", gap: 8 }}>
        <button className="btn primary" style={{ flex: 1, fontSize: 12 }} onClick={onNewSession}>
          + {t.newChat}
        </button>
        <button className="btn icon" title={t.pickFolder} onClick={onPickFolder}
          style={{ flexShrink: 0 }}>📁</button>
        <button className="btn icon" title={t.settings} onClick={() => onOpenSettings("general")}
          style={{ flexShrink: 0 }}>⚙</button>
      </div>

      {/* ── Project chip ── */}
      {projectRoot && (
        <div style={{ padding: "0 12px 8px" }}>
          <div className="chip accent" style={{ width: "100%", justifyContent: "flex-start", cursor: "pointer" }}
            onClick={onPickFolder}>
            <span>📁</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {projectRoot.split(/[\\/]/).pop()}
            </span>
          </div>
        </div>
      )}

      {/* ── Segment tabs ── */}
      <div className="sidebar-tabs">
        {(["sessions", "files", "todos", "skills"] as const).map((v) => (
          <button
            key={v}
            className={`sidebar-tab ${view === v ? "active" : ""}`}
            onClick={() => setView(v)}
          >
            {v === "sessions" && "Chat"}
            {v === "files"   && "Files"}
            {v === "todos"   && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                Plan
                {hasTodoActive && <span className="dot-running" style={{ width: 5, height: 5 }} />}
              </span>
            )}
            {v === "skills"  && "/cmd"}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="sidebar-body">

        {/* Sessions */}
        {view === "sessions" && (
          sessions.length === 0
            ? <div className="empty-state" style={{ padding: "32px 16px" }}>{t.emptyProject}</div>
            : sessions.map((s) => {
              const live = getLiveSession(s.id);
              return (
                <div key={s.id}
                  className={`session-row ${s.id === activeSessionId ? "active" : ""}`}
                  onClick={() => onSwitchSession(s.id)}
                >
                  <span className="session-row-icon">
                    {live.running ? "●" : "○"}
                  </span>
                  <span className="session-row-title" dir="auto">
                    {s.title || t.newChat}
                  </span>
                  {live.running && (
                    <span className="session-row-running">
                      <span className="stream-dot" />
                      <span className="stream-dot" />
                      <span className="stream-dot" />
                    </span>
                  )}
                  {hasRunning && !live.running && (
                    <button className="session-row-del"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                    >✕</button>
                  )}
                  {!hasRunning && (
                    <button className="session-row-del"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                    >✕</button>
                  )}
                </div>
              );
            })
        )}

        {/* Files */}
        {view === "files" && (
          projectRoot
            ? <FileTree root={projectRoot} refreshKey={treeRefresh} emptyText={t.noFiles} />
            : <div className="empty-state" style={{ padding: "32px 16px" }}>{t.emptyProject}</div>
        )}

        {/* Todos (Plan) */}
        {view === "todos" && (
          activeLive.todos.length === 0
            ? <div className="empty-state" style={{ padding: "32px 16px" }}>{t.noTodos}</div>
            : <div className="todo-list" style={{ padding: "8px 12px" }}>
              {activeLive.todos.map((td) => (
                <div key={td.id} className={`todo-item ${td.status}`}>
                  <span className={`todo-dot ${td.status}`} />
                  <span className={`todo-text ${td.status}`}>{td.content}</span>
                </div>
              ))}
            </div>
        )}

        {/* Skills */}
        {view === "skills" && (
          <div>
            {skills.length > 0 && (
              <>
                <div className="skills-section-title">Slash commands</div>
                {skills.map((s) => (
                  <div key={s.path} className="skill-row" onClick={() => onSkillClick(s.name)}>
                    <span className="skill-row-name">/{s.name}</span>
                    <span className="skill-row-desc">{s.description}</span>
                  </div>
                ))}
              </>
            )}
            {mcpToolCount > 0 && (
              <>
                <div className="divider" style={{ margin: "8px 12px" }} />
                <div className="skills-section-title">MCP tools ({mcpToolCount})</div>
                <div className="skill-row" onClick={() => onOpenSettings("mcp")}>
                  <span className="skill-row-name">🔌 {mcpToolCount} active</span>
                  <span className="skill-row-desc">Click to manage servers</span>
                </div>
              </>
            )}
            {skills.length === 0 && mcpToolCount === 0 && (
              <div className="empty-state" style={{ padding: "32px 16px" }}>No skills loaded</div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        <button className="btn ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={onLangToggle}>
          🌐 {t.language}
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn ghost icon" onClick={() => onOpenSettings("docker")} title="Docker">🐳</button>
      </div>
    </aside>
  );
}
