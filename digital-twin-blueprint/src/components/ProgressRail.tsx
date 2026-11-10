const steps = [
  ["告诉我们你是谁", "写清你的身份、服务对象和访客最常问的问题。"],
  ["导入你的内容", "上传文章、访谈、FAQ、案例和常见回答。"],
  ["确认说话方式", "让分身知道你如何介绍自己、如何判断问题、哪些话不能替你说。"],
  ["测试它像不像你", "用真实访客问题试聊，标注回答是否像本人。"],
  ["发布接待页", "生成一个可分享的访客入口，接待、筛选并引导预约。"],
];

export function ProgressRail() {
  return (
    <div className="progress-rail">
      {steps.map(([title, body], index) => (
        <div className="progress-step" key={title}>
          <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
          <div className="step-body">
            <strong>{title}</strong>
            <span>{body}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
