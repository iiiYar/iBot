import React, { useCallback, useEffect, useState } from "react";
import type { SkillInfo } from "../agent";
import type { Session } from "../types/workspace";
import type { TodoItem } from "../agent";
import { STRINGS, type Lang } from "../i18n";

type TreeNode = { name: string; type: "dir" | "file"; size: number };

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
    return <div className="tree-row" style={{ paddingInlineStart: 10 + depth * 14 }}>…</div>;
  const render = (items: TreeNode[], parentRel: string, d: number): React.ReactNode =>
    items.map((node) => {
      const childRel = `${parentRel}/${node.name}`;
      if (node.type === "dir") {
        const isOpen = expanded.has(childRel);
        return (
          <div key={childRel}>
            <div className="tree-row dir" style={{ paddingInlineStart: 10 + d * 14 }} onClick={() => toggle(childRel)}>
              <span className="chev">{isOpen ? "▾" : "▸"}</span> {node.name}
            </div>
            {isOpen && (
              <ExpandedDir root={root} rel={childRel} depth={d + 1}
                expanded={expanded} toggle={toggle} refreshKey={refreshKey} />
            )}
          </div>
        );
      }
      return <div key={childRel} className="tree-row file" style={{ paddingInlineStart: 24 + d * 14 }}>{node.name}</div>;
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
            <div className="tree-row dir" style={{ paddingInlineStart: 10 + depth * 14 }} onClick={() => toggle(rel)}>
              <span className="chev">{isOpen ? "▾" : "▸"}</span> {node.name}
            </div>
            {isOpen && (
              <ExpandedDir root={root} rel={rel} depth={depth + 1}
                expanded={expanded} toggle={toggle} refreshKey={refreshKey} />
            )}
          </div>
        );
      }
      return <div key={rel} className="tree-row file" style={{ paddingInlineStart: 24 + depth * 14 }}>{node.name}</div>;
    });
  if (!tree.length) return <div className="sidebar-empty">{emptyText}</div>;
  return <div className="tree">{renderNodes(tree, ".", 0)}</div>;
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

  return (
    <aside className="sidebar">
      {/* ── Head ── */}
      <div className="sidebar-head">
        <div className="brand">
          <span className="logo">◈</span>
          <span className="name">{t.appName}</span>
        </div>
        <button className="icon-btn" title={t.settings} onClick={() => onOpenSettings("general")}>⚙</button>
      </div>

      {/* ── New chat ── */}
      <button className="new-chat-btn" onClick={onNewSession}>
        <span className="plus">+</span> {t.newChat}
      </button>

      {/* ── Project chip ── */}
      <button className="project-chip" onClick={onPickFolder} title={projectRoot ?? t.pickFolder}>
        <span>📁</span>
        <span className="project-name">{projectRoot ? projectRoot.split(/[\\/]/).pop() : t.noFolder}</span>
      </button>

      {/* ── Segment tabs ── */}
      <div className="sidebar-section">
        <div className="segment">
          <button className={view === "sessions" ? "active" : ""} onClick={() => setView("sessions")}>{t.sessions}</button>
          <button className={view === "files"   ? "active" : ""} onClick={() => setView("files")}>{t.files}</button>
          <button className={view === "todos"   ? "active" : ""} onClick={() => setView("todos")}>
            {t.todos}
            {activeLive.todos.some((x) => x.status === "in_progress") && <span className="pulse-dot" style={{ marginInlineStart: 4 }} />}
          </button>
          {skills.length > 0 && (
            <button className={view === "skills" ? "active" : ""} onClick={() => setView("skills")}>/{"..."}</button>
          )}
        </div>

        <div className="sidebar-content">
          {/* Sessions */}
          {view === "sessions" && (
            <div className="sessions-panel">
              {sessions.length === 0 && <div className="sidebar-empty">{t.emptyProject}</div>}
              {sessions.map((s) => {
                const live = getLiveSession(s.id);
                return (
                  <div key={s.id}
                    className={`session-row ${s.id === activeSessionId ? "active" : ""}`}
                    onClick={() => onSwitchSession(s.id)}
                  >
                    <div className="session-main">
                      <div className="session-title">
                        {live.running && <span className="pulse-dot" />}
                        {s.title || t.newChat}
                      </div>
                      <div className="session-sub" dir="auto">
                        {live.projectRoot ? live.projectRoot.split(/[\\/]/).pop() : t.noFolder}
                      </div>
                    </div>
                    <button className="session-delete" title="✕"
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Files */}
          {view === "files" && (
            projectRoot
              ? <FileTree root={projectRoot} refreshKey={treeRefresh} emptyText={t.noFiles} />
              : <div className="sidebar-empty">{t.emptyProject}</div>
          )}

          {/* Todos */}
          {view === "todos" && (
            <div className="todos-panel">
              {activeLive.todos.length === 0 && <div className="sidebar-empty">{t.noTodos}</div>}
              {activeLive.todos.map((td) => (
                <div key={td.id} className={`todo-item ${td.status}`}>
                  <span className="todo-check">
                    {td.status === "completed" ? "✓" : td.status === "in_progress" ? "●" : td.status === "cancelled" ? "×" : "○"}
                  </span>
                  <span>{td.content}</span>
                </div>
              ))}
            </div>
          )}

          {/* Skills dashboard */}
          {view === "skills" && (
            <div className="skills-panel">
              <div className="skills-panel-title">Slash commands</div>
              {skills.map((s) => (
                <div key={s.path} className="skill-row" onClick={() => onSkillClick(s.name)}>
                  <span className="skill-row-name">/{s.name}</span>
                  <span className="skill-row-desc" dir="auto">{s.description}</span>
                </div>
              ))}
              {mcpToolCount > 0 && (
                <>
                  <div className="skills-panel-sep" />
                  <div className="skills-panel-title">MCP tools ({mcpToolCount})</div>
                  <div className="skills-panel-hint" onClick={() => onOpenSettings("mcp")}>
                    🔌 {mcpToolCount} {STRINGS[lang].mcpActive} — click to manage
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="sidebar-foot">
        <button className="lang-btn" onClick={onLangToggle}>🌐 {t.language}</button>
      </div>
    </aside>
  );
}
