import React, { useEffect, useState } from "react";
import type { EditProposal } from "../agent";

interface DiffLine {
  type: "add" | "del" | "ctx";
  lineNum: number;
  text: string;
}

function computeDiff(before: string, after: string): DiffLine[] {
  const bLines = before.split("\n");
  const aLines = after.split("\n");
  const result: DiffLine[] = [];
  // Simple LCS-based diff — good enough for display
  const maxLen = Math.max(bLines.length, aLines.length);
  let bi = 0, ai = 0, lineNum = 1;
  // Fast path: iterate both in sync, emit context for equal, del/add for diff
  while (bi < bLines.length || ai < aLines.length) {
    const b = bLines[bi];
    const a = aLines[ai];
    if (b === a) {
      result.push({ type: "ctx", lineNum, text: b ?? "" });
      bi++; ai++; lineNum++;
    } else if (bi < bLines.length) {
      result.push({ type: "del", lineNum, text: b ?? "" });
      bi++; lineNum++;
      if (ai < aLines.length) {
        result.push({ type: "add", lineNum: ai + 1, text: aLines[ai] ?? "" });
        ai++;
      }
    } else {
      result.push({ type: "add", lineNum: ai + 1, text: a ?? "" });
      ai++;
    }
  }
  return result;
}

function collapseDiff(lines: DiffLine[], ctx = 3): DiffLine[] {
  // Show only changed lines + ctx lines around them
  const changed = new Set<number>();
  lines.forEach((l, i) => { if (l.type !== "ctx") changed.add(i); });
  const visible = new Set<number>();
  changed.forEach((i) => {
    for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++)
      visible.add(j);
  });
  const result: DiffLine[] = [];
  let last = -1;
  [...visible].sort((a, b) => a - b).forEach((i) => {
    if (last !== -1 && i > last + 1) result.push({ type: "ctx", lineNum: -1, text: "@@ ... @@" });
    result.push(lines[i]);
    last = i;
  });
  return result;
}

export interface DiffOverlayProps {
  proposal: EditProposal | null;
  onApprove: () => void;
  onReject:  () => void;
}

export function DiffOverlay({ proposal, onApprove, onReject }: DiffOverlayProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setExpanded(false); }, [proposal?.path]);

  if (!proposal) return null;

  const allLines   = computeDiff(proposal.before, proposal.after);
  const shownLines = expanded ? allLines : collapseDiff(allLines);

  const adds = allLines.filter((l) => l.type === "add").length;
  const dels = allLines.filter((l) => l.type === "del").length;
  const isNewFile = !proposal.before;

  return (
    <div className="diff-overlay" onClick={(e) => e.target === e.currentTarget && onReject()}>
      <div className="diff-modal anim-scale-in">

        {/* Header */}
        <div className="diff-modal-header">
          <span style={{ fontSize: 14, opacity: .6 }}>{isNewFile ? "📄" : "🖊️"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="diff-modal-title">{proposal.path}</div>
            {proposal.description && (
              <div className="diff-modal-desc">{proposal.description}</div>
            )}
          </div>
          {/* Stats */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {adds > 0 && (
              <span className="chip" style={{ borderColor: "var(--border-success)", color: "var(--green-400)", background: "rgba(16,185,129,.10)" }}>
                +{adds}
              </span>
            )}
            {dels > 0 && (
              <span className="chip" style={{ borderColor: "var(--border-error)", color: "var(--red-400)", background: "rgba(239,68,68,.10)" }}>
                -{dels}
              </span>
            )}
          </div>
        </div>

        {/* Diff body */}
        <div className="diff-body">
          {isNewFile ? (
            proposal.after.split("\n").map((line, i) => (
              <div key={i} className="diff-line diff-line-add">
                <span className="diff-line-num">{i + 1}</span>
                <span className="diff-line-sign">+</span>
                <span className="diff-line-content">{line}</span>
              </div>
            ))
          ) : (
            shownLines.map((line, i) => (
              <div key={i} className={`diff-line diff-line-${line.type}`}>
                <span className="diff-line-num">
                  {line.lineNum > 0 ? line.lineNum : ""}
                </span>
                <span className="diff-line-sign">
                  {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                </span>
                <span className="diff-line-content">{line.text}</span>
              </div>
            ))
          )}
          {!expanded && allLines.length > shownLines.length && (
            <div
              style={{ textAlign: "center", padding: "8px", cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}
              onClick={() => setExpanded(true)}
            >
              Show all {allLines.length} lines ▾
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="diff-modal-footer">
          <button className="btn ghost sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Collapse" : "Expand all"}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn danger sm" onClick={onReject}>
            ✕ Reject
          </button>
          <button className="btn primary sm" onClick={onApprove}>
            ✓ Apply
          </button>
        </div>
      </div>
    </div>
  );
}
