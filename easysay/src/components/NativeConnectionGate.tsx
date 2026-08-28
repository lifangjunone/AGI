import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Laptop,
  LoaderCircle,
  RefreshCw,
  Wifi
} from "lucide-react";
import {
  getDefaultNativeBaseUrl,
  isNativeApp,
  loadNativeConnection,
  saveNativeConnection,
  testNativeConnection
} from "../lib/nativeConnection";

export default function NativeConnectionGate({
  children
}: {
  children: ReactNode;
}) {
  const [checking, setChecking] = useState(isNativeApp());
  const [connected, setConnected] = useState(!isNativeApp());
  const [baseUrl, setBaseUrl] = useState(getDefaultNativeBaseUrl());
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isNativeApp()) return;
    void (async () => {
      const saved = await loadNativeConnection();
      if (!saved) {
        setChecking(false);
        return;
      }
      setBaseUrl(saved.baseUrl);
      setAccessCode(saved.accessCode);
      try {
        await testNativeConnection(saved);
        setConnected(true);
      } catch {
        const currentDefault = getDefaultNativeBaseUrl();
        if (currentDefault !== saved.baseUrl) {
          try {
            const recovered = {
              baseUrl: currentDefault,
              accessCode: saved.accessCode
            };
            await testNativeConnection(recovered);
            await saveNativeConnection(recovered);
            setBaseUrl(currentDefault);
            setConnected(true);
            return;
          } catch {
            setBaseUrl(currentDefault);
          }
        }
        setError("网络已变化，请确认当前电脑地址后重新连接");
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const connect = async () => {
    setChecking(true);
    setError(undefined);
    try {
      const connection = { baseUrl, accessCode };
      await testNativeConnection(connection);
      await saveNativeConnection(connection);
      setConnected(true);
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "无法连接电脑"
      );
    } finally {
      setChecking(false);
    }
  };

  if (connected) return children;

  return (
    <main className="native-connect-page">
      <div className="native-connect-brand">
        <span className="app-mark">E</span>
        <div>
          <strong>EasySay</strong>
          <small>原生口语教练</small>
        </div>
      </div>

      <section className="native-connect-content">
        <span className="native-connect-icon">
          <Laptop size={30} />
        </span>
        <span className="eyebrow">CONNECT YOUR MAC</span>
        <h1>连接语音模型</h1>
        <p>手机和电脑连接同一个 Wi-Fi，电脑保持 EasySay 服务运行。</p>

        <label className="form-field">
          <span>电脑地址</span>
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="http://192.168.1.7:8785"
          />
        </label>

        <label className="form-field">
          <span>6 位连接码</span>
          <input
            className="native-code-input"
            value={accessCode}
            onChange={(event) =>
              setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
          />
        </label>

        {error && <p className="native-connect-error">{error}</p>}

        <button
          className="primary-button native-connect-button"
          onClick={() => void connect()}
          disabled={checking || accessCode.length !== 6}
        >
          {checking ? (
            <LoaderCircle className="spin" size={19} />
          ) : error ? (
            <RefreshCw size={19} />
          ) : (
            <Wifi size={19} />
          )}
          {checking ? "正在连接..." : error ? "重新连接" : "连接并开始学习"}
        </button>

        <div className="native-connect-note">
          <CheckCircle2 size={17} />
          <span>录音经局域网发送到你的 Mac；云端教练仅使用文字</span>
        </div>
      </section>
    </main>
  );
}
