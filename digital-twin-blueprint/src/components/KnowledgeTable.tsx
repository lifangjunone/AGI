import type { KnowledgeSource } from "@/lib/types";

const permissionLabel: Record<KnowledgeSource["permission"], string> = {
  public: "可公开回答",
  summary_only: "只可概括",
  private_memory: "只用于理解我",
  blocked: "不要使用",
};

const statusLabel: Record<KnowledgeSource["status"], string> = {
  queued: "等待整理",
  processing: "正在整理",
  ready: "已可使用",
  needs_review: "需要你确认",
};

export function KnowledgeTable({ sources }: { sources: KnowledgeSource[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>资料</th>
            <th>类型</th>
            <th>分身如何使用</th>
            <th>整理状态</th>
            <th>主题</th>
            <th>更新</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id}>
              <td>
                <strong>{source.title}</strong>
                <br />
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {source.id}
                </span>
              </td>
              <td>{source.type}</td>
              <td>
                <span
                  className={`status-pill ${
                    source.permission === "blocked"
                      ? "blocked"
                      : source.permission === "private_memory"
                        ? "warning"
                        : "ready"
                  }`}
                >
                  {permissionLabel[source.permission]}
                </span>
              </td>
              <td>{statusLabel[source.status]}</td>
              <td>
                <div className="chip-row">
                  {source.topics.map((topic) => (
                    <span className="tag" key={topic}>
                      {topic}
                    </span>
                  ))}
                </div>
              </td>
              <td className="mono">{source.updatedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
