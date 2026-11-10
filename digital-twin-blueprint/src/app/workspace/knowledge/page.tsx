import { AppShell } from "@/components/AppShell";
import { KnowledgeTable } from "@/components/KnowledgeTable";
import { knowledgeSources } from "@/lib/mock-data";

export default function KnowledgePage() {
  return (
    <AppShell active="/workspace/knowledge">
      <div className="page-title">
        <div>
          <p className="eyebrow">资料与记忆</p>
          <h1 style={{ fontSize: "clamp(40px, 5vw, 70px)" }}>
            告诉分身哪些内容可以说，哪些只能理解你
          </h1>
          <p>
            这里不是技术知识库，而是你的个人品牌资料室。每份资料都可以设置使用方式，避免分身把私密内容说给访客。
          </p>
        </div>
        <button className="button" type="button">
          添加资料
        </button>
      </div>

      <section className="section grid-3">
        <div className="workspace-card">
          <h3>可公开回答</h3>
          <p>适合文章、公开访谈、官网 FAQ。访客问到时可以直接回答。</p>
          <span className="status-pill ready">适合对外</span>
        </div>
        <div className="workspace-card">
          <h3>只用于理解我</h3>
          <p>适合价值观、判断原则、内部笔记。影响语气和判断，但不透露原文。</p>
          <span className="status-pill warning">需要谨慎</span>
        </div>
        <div className="workspace-card">
          <h3>不要使用</h3>
          <p>适合报价、私人联系、未公开合作信息。只保留为边界提醒。</p>
          <span className="status-pill blocked">不会回答</span>
        </div>
      </section>

      <section className="section">
        <div className="workspace-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">你的资料室</p>
              <h2>分身会如何使用这些内容</h2>
            </div>
            <p className="section-note">
              后续接真实后端时，这里会变成上传、解析、复核和权限管理流程。
            </p>
          </div>
          <KnowledgeTable sources={knowledgeSources} />
        </div>
      </section>
    </AppShell>
  );
}
