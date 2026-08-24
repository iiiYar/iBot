import React from "react";

export interface TokenUsageData {
  prompt: number;
  completion: number;
  total: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function TokenUsage({ usage }: { usage: TokenUsageData }) {
  if (!usage.total) return null;
  return (
    <div className="token-usage" title={`${usage.prompt.toLocaleString()} prompt + ${usage.completion.toLocaleString()} completion = ${usage.total.toLocaleString()} total tokens`}>
      <span className="token-in"  title="Prompt tokens">↑{fmt(usage.prompt)}</span>
      <span className="token-sep">·</span>
      <span className="token-out" title="Completion tokens">↓{fmt(usage.completion)}</span>
      <span className="token-sep">·</span>
      <span className="token-total">{fmt(usage.total)}</span>
    </div>
  );
}
