import type { Twin } from "@/lib/types";

const scoreLabels = [
  ["knowledgeAccuracy", "资料完整度"],
  ["styleSimilarity", "像本人程度"],
  ["boundarySafety", "边界清晰度"],
  ["publishReadiness", "发布准备度"],
] as const;

export function PersonaScore({ scores }: { scores: Twin["scores"] }) {
  return (
    <div className="score-grid">
      {scoreLabels.map(([key, label]) => (
        <div className="score-card" key={key}>
          <strong>{scores[key]}</strong>
          <span>{label}</span>
          <div className="meter" aria-label={`${label} ${scores[key]} 分`}>
            <span style={{ width: `${scores[key]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
