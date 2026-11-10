import { AppShell } from "@/components/AppShell";
import { personaProfile } from "@/lib/mock-data";

export default function PersonaPage() {
  return (
    <AppShell active="/workspace/persona">
      <div className="page-title">
        <div>
          <p className="eyebrow">说话方式</p>
          <h1 style={{ fontSize: "clamp(40px, 5vw, 70px)" }}>
            让分身知道什么像你，什么不能替你说
          </h1>
          <p>
            这里维护的是你的个人表达边界：如何介绍自己、如何判断问题、常用语气，以及哪些内容必须转本人确认。
          </p>
        </div>
        <button className="button" type="button">
          保存说话方式
        </button>
      </div>

      <section className="section grid-2">
        <div className="workspace-card form-grid">
          <label className="field">
            <span>分身如何介绍你</span>
            <textarea defaultValue={personaProfile.identityStatement} />
          </label>
          <label className="field">
            <span>资料不足时怎么说</span>
            <textarea defaultValue={personaProfile.fallbackPolicy} />
          </label>
        </div>

        <div className="workspace-card">
          <h3>像我程度</h3>
          <p>
            默认偏保守：先回答准确，再逐步加入你的表达习惯。真正对外发布前，需要你确认关键回答。
          </p>
          <div className="meter" aria-label="像我程度 68">
            <span style={{ width: "68%" }} />
          </div>
          <div className="chip-row" style={{ marginTop: 16 }}>
            <span className="tag">更准确</span>
            <span className="tag">当前 68</span>
            <span className="tag">更像我</span>
          </div>
        </div>
      </section>

      <section className="section grid-2">
        <PersonaList title="语气" items={personaProfile.tone} />
        <PersonaList title="我的判断原则" items={personaProfile.values} />
        <PersonaList title="不该替我说的话" items={personaProfile.boundaries} />
        <PersonaList title="示例回答" items={personaProfile.expressionSamples} />
      </section>
    </AppShell>
  );
}

function PersonaList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="workspace-card">
      <h3>{title}</h3>
      <div className="progress-rail">
        {items.map((item, index) => (
          <div className="progress-step" key={item}>
            <span className="step-index">{index + 1}</span>
            <div className="step-body">
              <span>{item}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
