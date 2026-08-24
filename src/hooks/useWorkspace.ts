import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, Session } from "../types/workspace";

export type WorkspaceState = {
  projects:       Project[];
  activeProject:  Project | null;
  sessions:       Session[];
  activeSession:  Session | null;

  // Actions
  createProject:  (name: string, rootPath: string) => Promise<Project>;
  switchProject:  (id: string) => void;
  deleteProject:  (id: string) => void;

  createSession:  (projectId?: string) => Promise<Session>;
  switchSession:  (id: string) => void;
  deleteSession:  (id: string) => void;
  patchSession:   (id: string, patch: Partial<Session>) => void;
  persistSession: (session: Session) => void;
};

export function useWorkspace(): WorkspaceState {
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [sessions,      setSessions]      = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // ── Bootstrap ──────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [pList, sList] = await Promise.all([
        window.botyar.projectsList().catch(() => [] as Project[]),
        window.botyar.sessionsList().catch(() => [] as Session[]),
      ]);

      setProjects(pList);
      setSessions(sList);

      if (pList.length > 0) {
        const first = pList[0];
        setActiveProject(first);
        const projectSessions = sList.filter((s) => s.projectId === first.id);
        if (projectSessions.length > 0) {
          const resume = first.lastSessionId
            ? projectSessions.find((s) => s.id === first.lastSessionId) ?? projectSessions[0]
            : projectSessions[0];
          setActiveSession(resume);
        }
      } else if (sList.length > 0) {
        // Legacy sessions without a project
        setActiveSession(sList[0]);
      }
    })();
  }, []);

  // ── Projects ──────────────────────────────────────────────────
  const createProject = useCallback(async (name: string, rootPath: string): Promise<Project> => {
    const project = await window.botyar.projectsSave({ name, rootPath });
    setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
    setActiveProject(project);
    return project;
  }, []);

  const switchProject = useCallback((id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    setActiveProject(project);
    const projectSessions = sessionsRef.current.filter((s) => s.projectId === id);
    if (projectSessions.length > 0) {
      const resume = project.lastSessionId
        ? projectSessions.find((s) => s.id === project.lastSessionId) ?? projectSessions[0]
        : projectSessions[0];
      setActiveSession(resume);
    } else {
      setActiveSession(null);
    }
  }, [projects]);

  const deleteProject = useCallback((id: string) => {
    void window.botyar.projectsDelete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProject?.id === id) {
      const remaining = projects.filter((p) => p.id !== id);
      setActiveProject(remaining[0] ?? null);
    }
  }, [activeProject, projects]);

  // ── Sessions ──────────────────────────────────────────────────
  const createSession = useCallback(async (projectId?: string): Promise<Session> => {
    const pid = projectId ?? activeProject?.id ?? null;
    const session = await window.botyar.sessionsSave({
      title: "",
      model: "",
      projectId: pid ?? undefined,
      messages: [],
    });
    setSessions((prev) => [session, ...prev]);
    setActiveSession(session);
    return session;
  }, [activeProject]);

  const switchSession = useCallback((id: string) => {
    const session = sessionsRef.current.find((s) => s.id === id);
    if (session) setActiveSession(session);
  }, []);

  const deleteSession = useCallback((id: string) => {
    void window.botyar.sessionsDelete(id);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeSession?.id === id) {
        const fallback = next.find((s) => s.projectId === activeProject?.id) ?? next[0] ?? null;
        setActiveSession(fallback);
      }
      return next;
    });
  }, [activeSession, activeProject]);

  const patchSession = useCallback((id: string, patch: Partial<Session>) => {
    setSessions((prev) =>
      prev.map((s) => s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)
    );
    setActiveSession((prev) =>
      prev?.id === id ? { ...prev, ...patch, updatedAt: Date.now() } : prev
    );
  }, []);

  const persistSession = useCallback((session: Session) => {
    void window.botyar.sessionsSave({
      id:        session.id,
      projectId: session.projectId,
      title:     session.title,
      model:     session.model,
      messages:  session.messages,
      tokenUsage: session.tokenUsage,
    }).catch(() => {});
  }, []);

  return {
    projects,
    activeProject,
    sessions,
    activeSession,
    createProject,
    switchProject,
    deleteProject,
    createSession,
    switchSession,
    deleteSession,
    patchSession,
    persistSession,
  };
}
