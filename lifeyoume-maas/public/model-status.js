export const modelStatusOptions = [
  ["all", "全部状态"], ["enabled", "已启用"], ["disabled", "已停用"],
  ["healthy", "目录核验通过"], ["failed", "连接异常"], ["unconfigured", "待配置"],
  ["needs_verification", "全部待核验"], ["untested", "未验证"],
  ["model_not_listed", "目录未找到"], ["directory_unavailable", "无法核验"]
];

export function modelHealth(model, deployment = {}, provider = {}) {
  if (!model.enabled || !deployment.enabled) return { code: "disabled", label: "已停用", tone: "neutral" };
  if (provider.kind !== "internal" && !provider.hasCredential) return { code: "unconfigured", label: "待配置", tone: "warn" };
  if (deployment.lastTestCode === "model_not_listed") return { code: "model_not_listed", label: "目录未找到", tone: "warn" };
  if (deployment.lastTestCode === "directory_unavailable") return { code: "directory_unavailable", label: "无法核验", tone: "warn" };
  if (deployment.lastTestStatus === "failed" || deployment.health === "unhealthy") {
    return { code: "failed", label: "连接异常", tone: "danger" };
  }
  if (deployment.lastTestStatus === "healthy") return { code: "healthy", label: "目录核验通过", tone: "good" };
  return { code: "untested", label: "未验证", tone: "warn" };
}

export function matchesModelStatus(status, model, deployment = {}, provider = {}) {
  if (status === "all") return true;
  if (status === "enabled") return Boolean(model.enabled && deployment.enabled);
  const code = modelHealth(model, deployment, provider).code;
  if (status === "needs_verification") {
    return ["untested", "model_not_listed", "directory_unavailable"].includes(code);
  }
  return modelStatusOptions.some(([value]) => value === status) && code === status;
}
