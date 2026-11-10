"use client";

import { useState } from "react";

const labels = [
  ["accurate_and_like_me", "像我，会这样说"],
  ["accurate_but_not_like_me", "意思对，但不像我"],
  ["wrong", "不准确"],
  ["should_not_answer", "这不该替我回答"],
] as const;

export function CorrectionPanel({ messageId }: { messageId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState("");

  return (
    <div className="correction-actions" aria-label={`这像我吗 ${messageId}`}>
      {labels.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setSelected(value)}
          aria-pressed={selected === value}
          style={
            selected === value
              ? {
                  borderColor: "var(--node-border)",
                  background: "var(--node)",
                  color: "var(--node-text)",
                }
              : undefined
          }
        >
          {label}
        </button>
      ))}
      {selected ? (
        <label className="field">
          <span>我会这样说</span>
          <textarea
            value={rewrite}
            onChange={(event) => setRewrite(event.target.value)}
            placeholder="可选：写下你本人会怎么回答。"
          />
        </label>
      ) : null}
    </div>
  );
}
