import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Database,
  Languages,
  LoaderCircle,
  Mic2,
  RefreshCw,
  Save,
  Volume2
} from "lucide-react";
import {
  getLanguage,
  languageOptions,
  targetLanguageOptions
} from "../data/languages";
import {
  getSpeechConfig,
  loadSpeechModels,
  saveSpeechConfig
} from "../lib/api";
import { speakText } from "../lib/speech";
import {
  clearNativeConnection,
  isNativeApp
} from "../lib/nativeConnection";
import EvolutionSettings from "./EvolutionSettings";
import type {
  EvolutionState,
  SpeechConfig,
  LanguageCode,
  LearnerProfile,
  SpeechModelStatus,
  SpeechServiceStatus
} from "../types";

type BusyAction = "refresh" | "save" | "load" | "test";

interface Props {
  profile?: LearnerProfile;
  onUpdateProfile?: (profile: LearnerProfile) => Promise<void>;
  evolution?: EvolutionState;
  evolutionRunning?: boolean;
  onUpdateEvolution?: (patch: Partial<EvolutionState>) => void;
  onRunEvolution?: () => Promise<void>;
  recordCount?: number;
}

function updateServiceUrl(
  current: SpeechConfig["service"],
  baseUrl: string
): SpeechConfig["service"] {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname === "[::1]" ? "::1" : url.hostname;
    const host = ["127.0.0.1", "localhost", "::1"].includes(hostname)
      ? (hostname as SpeechConfig["service"]["host"])
      : current.host;
    return {
      ...current,
      baseUrl,
      host,
      port: url.port ? Number(url.port) : current.port
    };
  } catch {
    return { ...current, baseUrl };
  }
}

function ModelState({
  label,
  icon: Icon,
  status
}: {
  label: string;
  icon: typeof Mic2;
  status?: SpeechModelStatus;
}) {
  const ready = Boolean(status?.present);
  return (
    <article className={`model-state ${ready ? "ready" : "missing"}`}>
      <span className="model-state-icon">
        <Icon size={19} />
      </span>
      <div>
        <strong>{label}</strong>
        <small>
          {!status
            ? "等待服务"
            : status.loaded
              ? "已载入内存"
              : ready
                ? "权重已就绪"
                : "未安装权重"}
        </small>
      </div>
      {ready ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
    </article>
  );
}

export default function SpeechSettings({
  profile,
  onUpdateProfile,
  evolution,
  evolutionRunning = false,
  onUpdateEvolution,
  onRunEvolution,
  recordCount = 0
}: Props) {
  const [config, setConfig] = useState<SpeechConfig>();
  const [service, setService] = useState<SpeechServiceStatus>();
  const [busy, setBusy] = useState<BusyAction>();
  const [message, setMessage] = useState<string>();
  const [languageDraft, setLanguageDraft] = useState(profile);

  const refresh = async () => {
    setBusy("refresh");
    setMessage(undefined);
    try {
      const result = await getSpeechConfig();
      setConfig(result.config);
      setService(result.service);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取配置失败");
    } finally {
      setBusy(undefined);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setLanguageDraft(profile);
  }, [profile]);

  const save = async () => {
    if (!config) return;
    setBusy("save");
    setMessage(undefined);
    try {
      const result = await saveSpeechConfig(config);
      setConfig(result.config);
      setService(result.service);
      setMessage(result.service.ok ? "配置已保存并应用" : "配置已保存，服务尚未连接");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存配置失败");
    } finally {
      setBusy(undefined);
    }
  };

  const loadModels = async () => {
    setBusy("load");
    setMessage("正在将模型载入统一内存...");
    try {
      const status = await loadSpeechModels();
      setService(status);
      setMessage("ASR 和 TTS 已载入");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模型载入失败");
    } finally {
      setBusy(undefined);
    }
  };

  const testVoice = async () => {
    setBusy("test");
    setMessage("正在生成本地试听...");
    const target = getLanguage(profile?.targetLanguage ?? "en");
    const source = await speakText(
      target.sample,
      profile?.accent ?? "american",
      profile?.targetLanguage ?? "en"
    );
    setMessage(
      source === "local" ? "本地 TTS 试听成功" : "已降级到系统朗读"
    );
    setBusy(undefined);
    if (source === "local") void refresh();
  };

  const updateAsr = (patch: Partial<SpeechConfig["asr"]>) => {
    setConfig((current) =>
      current ? { ...current, asr: { ...current.asr, ...patch } } : current
    );
  };

  const updateTts = (patch: Partial<SpeechConfig["tts"]>) => {
    setConfig((current) =>
      current ? { ...current, tts: { ...current.tts, ...patch } } : current
    );
  };

  const languageSettings =
    profile && languageDraft && onUpdateProfile ? (
      <section className="model-config-section language-settings">
        <div className="section-title compact-title">
          <div>
            <span className="eyebrow">LEARNING LANGUAGE</span>
            <h2>学习语言</h2>
          </div>
          <Languages size={20} />
        </div>
        <p className="settings-description">
          教练反馈使用母语，听说训练和课程资料使用目标语言。
        </p>
        <div className="language-pair">
          <label className="form-field">
            <span>我的母语</span>
            <select
              value={languageDraft.nativeLanguage}
              onChange={(event) => {
                const nativeLanguage = event.target.value as LanguageCode;
                setLanguageDraft((current) =>
                  current
                    ? {
                        ...current,
                        nativeLanguage,
                        targetLanguage:
                          current.targetLanguage === nativeLanguage
                            ? nativeLanguage === "en"
                              ? "zh-CN"
                              : "en"
                            : current.targetLanguage
                      }
                    : current
                );
              }}
            >
              {languageOptions.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label} · {language.nativeLabel}
                </option>
              ))}
            </select>
          </label>
          <span className="language-arrow" aria-hidden="true">
            →
          </span>
          <label className="form-field">
            <span>想学习</span>
            <select
              value={languageDraft.targetLanguage}
              onChange={(event) =>
                setLanguageDraft((current) =>
                  current
                    ? {
                        ...current,
                        targetLanguage: event.target.value as LanguageCode
                      }
                    : current
                )
              }
            >
              {targetLanguageOptions(languageDraft.nativeLanguage).map(
                (language) => (
                  <option key={language.code} value={language.code}>
                    {language.label} · {language.nativeLabel}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
        <button
          className="ghost-button full"
          disabled={
            Boolean(busy) ||
            (languageDraft.nativeLanguage === profile.nativeLanguage &&
              languageDraft.targetLanguage === profile.targetLanguage)
          }
          onClick={async () => {
            setBusy("save");
            await onUpdateProfile(languageDraft);
            setMessage("语言档案和课程路线已更新");
            setBusy(undefined);
          }}
        >
          <Save size={17} />
          更新语言与课程
        </button>
      </section>
    ) : null;
  const evolutionSettings =
    profile &&
    evolution &&
    onUpdateEvolution &&
    onRunEvolution ? (
      <EvolutionSettings
        evolution={evolution}
        recordCount={recordCount}
        running={evolutionRunning}
        onChange={onUpdateEvolution}
        onRun={onRunEvolution}
      />
    ) : null;

  if (!config) {
    return (
      <div className="page model-settings-page">
        <header className="top-header model-settings-header">
          <div>
            <span className="eyebrow">LEARNING SETTINGS</span>
            <h1>学习设置</h1>
          </div>
          <button
            className="icon-button"
            onClick={() => void refresh()}
            disabled={Boolean(busy)}
            aria-label="重试连接模型服务"
          >
            <RefreshCw size={20} />
          </button>
        </header>
        {languageSettings}
        {evolutionSettings}
        <div className="model-settings-loading">
          {busy ? (
            <LoaderCircle className="spin" size={24} />
          ) : (
            <CircleAlert size={24} />
          )}
          <span>{message ?? "正在读取本地模型..."}</span>
        </div>
      </div>
    );
  }

  const serviceReady = Boolean(service?.ok);

  return (
    <div className="page model-settings-page">
      <header className="top-header model-settings-header">
        <div>
          <span className="eyebrow">LEARNING SETTINGS</span>
          <h1>学习设置</h1>
        </div>
        <button
          className="icon-button"
          onClick={() => void refresh()}
          disabled={Boolean(busy)}
          aria-label="刷新模型状态"
          title="刷新模型状态"
        >
          <RefreshCw className={busy === "refresh" ? "spin" : ""} size={20} />
        </button>
      </header>

      {languageSettings}
      {evolutionSettings}

      <section className="speech-health-band">
        <div className="speech-health-title">
          <span className={serviceReady ? "health-dot ready" : "health-dot"} />
          <div>
            <strong>{serviceReady ? "本地服务在线" : "本地服务未连接"}</strong>
            <small>{config.service.baseUrl}</small>
          </div>
          <Activity size={19} />
        </div>
        <div className="model-state-grid">
          <ModelState
            label={`${getLanguage(profile?.targetLanguage ?? "en").label}转写`}
            icon={Mic2}
            status={service?.models?.asr}
          />
          <ModelState
            label="自然朗读"
            icon={Volume2}
            status={service?.models?.tts}
          />
        </div>
        {service?.metrics && (
          <div className="speech-metrics">
            <span>ASR {service.metrics.requests.asr} 次</span>
            <span>TTS {service.metrics.requests.tts} 次</span>
            <span>错误 {service.metrics.requests.errors} 次</span>
          </div>
        )}
      </section>

      <section className="model-config-section">
        <div className="section-title compact-title">
          <div>
            <span className="eyebrow">RUNTIME</span>
            <h2>服务</h2>
          </div>
          <Cpu size={20} />
        </div>
        <label className="form-field">
          <span>本机服务地址</span>
          <input
            value={config.service.baseUrl}
            onChange={(event) =>
              setConfig({
                ...config,
                service: updateServiceUrl(
                  config.service,
                  event.target.value
                )
              })
            }
          />
        </label>
        <label className="toggle-row">
          <div>
            <strong>按需载入模型</strong>
            <small>首次使用时载入，降低启动内存</small>
          </div>
          <input
            type="checkbox"
            checked={config.runtime.lazyLoad}
            onChange={(event) =>
              setConfig({
                ...config,
                runtime: {
                  ...config.runtime,
                  lazyLoad: event.target.checked
                }
              })
            }
          />
        </label>
        {isNativeApp() && (
          <button
            className="ghost-button native-change-computer"
            onClick={() => {
              void clearNativeConnection().then(() => window.location.reload());
            }}
          >
            <RefreshCw size={17} />
            更换连接的电脑
          </button>
        )}
      </section>

      <section className="model-config-section">
        <div className="section-title compact-title">
          <div>
            <span className="eyebrow">ASR</span>
            <h2>{getLanguage(profile?.targetLanguage ?? "en").label}转写</h2>
          </div>
          <Mic2 size={20} />
        </div>
        <label className="toggle-row">
          <strong>启用本地 ASR</strong>
          <input
            type="checkbox"
            checked={config.asr.enabled}
            onChange={(event) => updateAsr({ enabled: event.target.checked })}
          />
        </label>
        <label className="form-field">
          <span>ModelScope 模型</span>
          <input
            value={config.asr.modelId}
            onChange={(event) => updateAsr({ modelId: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span>本地权重目录</span>
          <input
            value={config.asr.modelPath}
            onChange={(event) => updateAsr({ modelPath: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span>识别语言</span>
          <input
            value={config.asr.language}
            onChange={(event) => updateAsr({ language: event.target.value })}
          />
        </label>
      </section>

      <section className="model-config-section">
        <div className="section-title compact-title">
          <div>
            <span className="eyebrow">TTS</span>
            <h2>自然朗读</h2>
          </div>
          <Volume2 size={20} />
        </div>
        <label className="toggle-row">
          <strong>启用本地 TTS</strong>
          <input
            type="checkbox"
            checked={config.tts.enabled}
            onChange={(event) => updateTts({ enabled: event.target.checked })}
          />
        </label>
        <label className="form-field">
          <span>ModelScope 模型</span>
          <input
            value={config.tts.modelId}
            onChange={(event) => updateTts({ modelId: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span>本地权重目录</span>
          <input
            value={config.tts.modelPath}
            onChange={(event) => updateTts({ modelPath: event.target.value })}
          />
        </label>
        <div className="split-fields">
          <label className="form-field">
            <span>美音音色</span>
            <input
              value={config.tts.americanVoice}
              onChange={(event) =>
                updateTts({ americanVoice: event.target.value })
              }
            />
          </label>
          <label className="form-field">
            <span>英音音色</span>
            <input
              value={config.tts.britishVoice}
              onChange={(event) =>
                updateTts({ britishVoice: event.target.value })
              }
            />
          </label>
        </div>
        <label className="form-field">
          <span>朗读风格</span>
          <textarea
            value={config.tts.styleInstruction}
            onChange={(event) =>
              updateTts({ styleInstruction: event.target.value })
            }
          />
        </label>
        <label className="range-field">
          <span>语速 {config.tts.speed.toFixed(1)}x</span>
          <input
            type="range"
            min="0.7"
            max="1.3"
            step="0.1"
            value={config.tts.speed}
            onChange={(event) =>
              updateTts({ speed: Number(event.target.value) })
            }
          />
        </label>
      </section>

      {message && (
        <div className="model-action-message">
          <Database size={16} />
          <span>{message}</span>
        </div>
      )}

      <div className="model-actions">
        <button
          className="ghost-button"
          onClick={() => void loadModels()}
          disabled={Boolean(busy) || !serviceReady}
        >
          {busy === "load" ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Database size={18} />
          )}
          载入模型
        </button>
        <button
          className="ghost-button"
          onClick={() => void testVoice()}
          disabled={Boolean(busy)}
        >
          {busy === "test" ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Volume2 size={18} />
          )}
          试听
        </button>
        <button
          className="primary-button"
          onClick={() => void save()}
          disabled={Boolean(busy)}
        >
          {busy === "save" ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Save size={18} />
          )}
          保存并应用
        </button>
      </div>
    </div>
  );
}
