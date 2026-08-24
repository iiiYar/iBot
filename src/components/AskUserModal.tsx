import type { PendingQuestion } from "../agent";

export interface AskUserModalProps {
  question: PendingQuestion | null;
  onAnswer: (answer: string) => void;
}

export function AskUserModal({ question, onAnswer }: AskUserModalProps) {
  if (!question) return null;

  return (
    <div className="modal-overlay">
      <div className="modal anim-scale-in" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <span style={{ fontSize: 16 }}>🤔</span>
          <span className="modal-title" style={{ fontSize: "var(--text-md)" }}>Agent needs clarification</span>
        </div>
        <div className="modal-body">
          <p style={{
            fontSize: "var(--text-md)",
            color: "var(--text-primary)",
            lineHeight: "var(--leading-relaxed)",
            marginBottom: question.options.length > 0 ? "var(--space-5)" : 0,
          }}>
            {question.question}
          </p>
          {question.options.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {question.options.map((opt) => (
                <button
                  key={opt}
                  className="btn"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => onAnswer(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        {question.options.length === 0 && (
          <div className="modal-footer" style={{ paddingTop: 0 }}>
            <button className="btn ghost sm" onClick={() => onAnswer("Skip")}>Skip</button>
            <button className="btn primary sm" onClick={() => onAnswer("Continue")}>Continue</button>
          </div>
        )}
      </div>
    </div>
  );
}
