import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProgressRail } from "@/components/ProgressRail";

export default function CreateTwinPage() {
  return (
    <AppShell active="/workspace/create">
      <div className="page-title">
        <div>
          <p className="eyebrow">创建向导</p>
          <h1 style={{ fontSize: "clamp(40px, 5vw, 70px)" }}>
            一步步做出可以接待访客的分身
          </h1>
          <p>
            你不需要理解模型和架构。只要告诉我们你是谁、导入你的内容、确认它说话像不像你，最后发布一个接待页。
          </p>
        </div>
        <Link className="button" href="/chat/demo">
          预览接待页
        </Link>
      </div>

      <section className="section grid-2">
        <div className="workspace-card">
          <h3>创建路径</h3>
          <ProgressRail />
        </div>
        <div className="workspace-card form-grid">
          <p className="eyebrow">当前步骤</p>
          <h2>告诉我们你是谁</h2>
          <p>
            先用自然语言写清楚你的身份、服务对象和最适合预约你的问题。后面可以再让分身根据资料自动修正。
          </p>
          <label className="field">
            <span>你的身份</span>
            <input defaultValue="产品与 AI 应用顾问，帮助创始人判断产品机会和落地路径。" />
          </label>
          <label className="field">
            <span>最适合来找你的人</span>
            <textarea defaultValue="已经有想法或早期产品，但不确定目标用户、商业化路径或 AI 功能优先级的创始人/负责人。" />
          </label>
          <label className="field">
            <span>访客不该期待你做什么</span>
            <textarea defaultValue="不直接承诺合作、报价、投资或招聘；不替代法律、医疗、财务等专业建议。" />
          </label>
          <div className="action-row">
            <button className="button" type="button">
              保存并继续导入内容
            </button>
            <button className="ghost-button" type="button">
              先用示例体验
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
