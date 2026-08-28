import { useEffect, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  LoaderCircle,
  Orbit,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Save
} from "lucide-react";
import {
  getEvolutionStatus,
  saveEvolutionInference
} from "../lib/api";
import type { EvolutionState } from "../types";

interface Props {
  evolution: EvolutionState;
  recordCount: number;
  running: boolean;
  onChange: (patch: Partial<EvolutionState>) => void;
  onRun: () => Promise<void>;
}

type EngineStatus = Awaited<ReturnType<typeof getEvolutionStatus>>;

export default function EvolutionSettings({
  evolution,
  recordCount,
  running,
  onChange,
  onRun
}: Props) {
  const [status, setStatus] = useState<EngineStatus>();
  const [statusError, setStatusError] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<"cloud" | "local">("cloud");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [modelMessage, setModelMessage] = useState<string>();

  const refresh = async () => {
    setStatusError(false);
    try {
      const next = await getEvolutionStatus();
      setStatus(next);
      setBaseUrl(next.inference.baseUrl);
      setModel(next.inference.model);
      setMode(next.inference.mode);
    } catch {
      setStatusError(true);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const ready = Boolean(status?.available);
  const newRecords = Math.max(
    0,
    recordCount - evolution.lastAnalyzedRecordCount
  );
  const insight = evolution.lastInsight;
  const saveModel = async () => {
    setSavingModel(true);
    setModelMessage("正在验证推理模型...");
    try {
      const result = await saveEvolutionInference({
        mode,
        baseUrl,
        model,
        apiKey: apiKey || undefined
      });
      setApiKey("");
      setStatus((current) =>
        current
          ? {
              ...current,
              available: true,
              configured: true,
              model: result.inference.model,
              inference: result.inference
            }
          : current
      );
      setModelMessage("连接验证成功，Hermes 已使用该模型");
    } catch (error) {
      setModelMessage(
        error instanceof Error ? error.message : "推理模型验证失败"
      );
    } finally {
      setSavingModel(false);
    }
  };
  const selectMode = (nextMode: "cloud" | "local") => {
    setMode(nextMode);
    setModelMessage(undefined);
    if (nextMode === "local" && status?.localModel) {
      setBaseUrl(status.localModel.baseUrl);
      setModel(status.localModel.modelPath);
    } else if (nextMode === "cloud") {
      setBaseUrl("https://ark.cn-beijing.volces.com/api/v3");
      setModel("doubao-seed-evolving");
    }
  };

  return (
    <section className="evolution-section">
      <div className="evolution-heading">
        <span className="evolution-mark">
          <Orbit size={22} />
          <i />
        </span>
        <div>
          <span className="eyebrow">ADVANCED SELF-EVOLUTION</span>
          <h2>赫尔墨斯认知进化引擎</h2>
          <p>从真实练习中形成能力画像，并持续重排你的专属路线。</p>
        </div>
      </div>

      <label className="toggle-row evolution-toggle">
        <div>
          <strong>启用学习自进化</strong>
          <small>关闭时不采集、不分析，也不会改动路线</small>
        </div>
        <input
          type="checkbox"
          checked={evolution.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
      </label>

      {evolution.enabled && (
        <div className="evolution-console">
          <div className="evolution-status">
            <span className={`health-dot ${ready ? "ready" : ""}`} />
            <div>
              <strong>
                {ready
                  ? "Hermes Agent 已就绪"
                  : status?.installed && !status.configured
                    ? "已安装，待配置推理模型"
                  : statusError
                    ? "状态读取失败"
                    : "Hermes Agent 未安装"}
              </strong>
              <small>{status?.runtime ?? "本机按需运行"}</small>
            </div>
            <button
              className="icon-button"
              onClick={() => void refresh()}
              aria-label="刷新自进化引擎状态"
              title="刷新状态"
            >
              <RefreshCw size={17} />
            </button>
          </div>

          <details className="evolution-model-config" open={!ready}>
            <summary>
              <KeyRound size={16} />
              推理模型
              <span>
                {status?.inference.apiKeyConfigured
                  ? "已配置"
                  : "使用当前模型"}
              </span>
            </summary>
            <div className="evolution-model-fields">
              <p>
                可使用云端模型，也可让 Hermes 完全通过 Mac 本地模型推理。
              </p>
              <div
                className="inference-mode-control"
                role="group"
                aria-label="推理模型来源"
              >
                <button
                  type="button"
                  className={mode === "cloud" ? "active" : ""}
                  onClick={() => selectMode("cloud")}
                >
                  <Cloud size={16} />
                  云端模型
                </button>
                <button
                  type="button"
                  className={mode === "local" ? "active" : ""}
                  onClick={() => selectMode("local")}
                >
                  <Laptop size={16} />
                  本地 MLX
                </button>
              </div>

              {mode === "local" && (
                <div
                  className={`local-model-state ${
                    status?.localModel.online ? "online" : ""
                  }`}
                >
                  <span className="health-dot" />
                  <div>
                    <strong>
                      {status?.localModel.online
                        ? "本地模型正在运行"
                        : status?.localModel.downloaded
                          ? "模型已下载，等待服务启动"
                          : "模型尚未下载完成"}
                    </strong>
                    <small>
                      {status?.localModel.modelId ??
                        "mlx-community/Qwen3.5-9B-MLX-8bit"}
                    </small>
                  </div>
                </div>
              )}

              <label className="form-field">
                <span>OpenAI-compatible 地址</span>
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>
              <label className="form-field">
                <span>模型名称</span>
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>
              {mode === "cloud" && (
                <label className="form-field">
                <span>
                  API Key
                  {status?.inference.apiKeyConfigured && (
                    <small>已安全保存，留空则保持不变</small>
                  )}
                </span>
                <span className="secret-input">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    placeholder={
                      status?.inference.apiKeyConfigured
                        ? "••••••••••••"
                        : "输入模型服务 API Key"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((current) => !current)}
                    aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                    title={showApiKey ? "隐藏" : "显示"}
                  >
                    {showApiKey ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
                </label>
              )}
              {modelMessage && (
                <p
                  className={
                    modelMessage.includes("成功")
                      ? "model-save-message success"
                      : "model-save-message"
                  }
                >
                  {modelMessage}
                </p>
              )}
              <button
                className="ghost-button full"
                disabled={
                  savingModel ||
                  !baseUrl.trim() ||
                  !model.trim() ||
                  (mode === "cloud" &&
                    !apiKey.trim() &&
                    !status?.inference.apiKeyConfigured)
                }
                onClick={() => void saveModel()}
              >
                {savingModel ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Save size={17} />
                )}
                保存并验证模型
              </button>
            </div>
          </details>

          <label className="toggle-row">
            <div>
              <strong>自动进化路线</strong>
              <small>每积累一组新口语记录后自动诊断</small>
            </div>
            <input
              type="checkbox"
              checked={evolution.autoEvolve}
              onChange={(event) =>
                onChange({ autoEvolve: event.target.checked })
              }
            />
          </label>

          <label className="range-field">
            <span>每 {evolution.recordsPerCycle} 次口语记录进化一次</span>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={evolution.recordsPerCycle}
              onChange={(event) =>
                onChange({ recordsPerCycle: Number(event.target.value) })
              }
            />
          </label>

          <div className="evolution-privacy">
            <ShieldCheck size={16} />
            <span>
              {status?.privacy ?? "只分析转写、评分和课程结构，不上传录音"}
            </span>
          </div>

          <button
            className="primary-button full evolution-run"
            disabled={running || recordCount === 0 || !ready}
            onClick={() => void onRun()}
          >
            {running ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <BrainCircuit size={18} />
            )}
            {running
              ? "正在重构学习路径..."
              : recordCount === 0
                ? "完成口语练习后启动"
                : `立即进化 · ${newRecords} 条新证据`}
          </button>

          {evolution.error && (
            <p className="evolution-error">
              <CircleAlert size={15} />
              {evolution.error}
            </p>
          )}
        </div>
      )}

      {evolution.enabled && insight && (
        <div className="evolution-report">
          <div className="evolution-report-title">
            <div>
              <Sparkles size={17} />
              <strong>最新认知跃迁报告</strong>
            </div>
            <span>
              {new Date(insight.generatedAt).toLocaleDateString("zh-CN")}
            </span>
          </div>
          <p>{insight.summary}</p>

          <div className="evolution-signals">
            {insight.focusAreas.map((focus) => (
              <article key={`${focus.area}-${focus.priority}`}>
                <span data-priority={focus.priority}>{focus.priority}</span>
                <strong>{focus.area}</strong>
                <small>{focus.evidence}</small>
              </article>
            ))}
          </div>

          {insight.routeChanges.length > 0 && (
            <div className="route-change-list">
              <strong>路线已定向重构</strong>
              {insight.routeChanges.map((change) => (
                <p key={`${change.week}-${change.newTheme}`}>
                  <CheckCircle2 size={15} />
                  <span>
                    第 {change.week} 周：{change.newTheme}
                    <small>{change.reason}</small>
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
