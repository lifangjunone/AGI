import { useEffect, useRef, useState } from "react";
import {
  Config,
  PixelStreaming
} from "@epicgames-ps/lib-pixelstreamingfrontend-ue5.7";
import type { AvatarRenderState, ViewMode } from "./ImmersiveStage";
import type { PerformanceState } from "./data";
import {
  createMetaHumanCommand,
  type MetaHumanState
} from "./metahuman-protocol";

type MetaHumanStageProps = MetaHumanState & {
  sceneImage: string;
  signalUrl: string;
  onRenderState?: (state: AvatarRenderState) => void;
};

export default function MetaHumanStage({
  sceneImage,
  signalUrl,
  actorName,
  avatarId,
  outfitId,
  performance,
  sceneId,
  speaking,
  viewMode,
  onRenderState
}: MetaHumanStageProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<PixelStreaming | null>(null);
  const onRenderStateRef = useRef(onRenderState);
  const stateRef = useRef<MetaHumanState>({
    actorName,
    avatarId,
    outfitId,
    performance,
    sceneId,
    speaking,
    viewMode
  });
  const [renderState, setRenderState] =
    useState<AvatarRenderState>("loading");
  const [playBlocked, setPlayBlocked] = useState(false);

  onRenderStateRef.current = onRenderState;
  stateRef.current = {
    actorName,
    avatarId,
    outfitId,
    performance,
    sceneId,
    speaking,
    viewMode
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setRenderState("loading");
    onRenderStateRef.current?.("loading");

    const config = new Config({
      initialSettings: {
        ss: signalUrl,
        AutoConnect: true,
        AutoPlayVideo: true,
        StartVideoMuted: true,
        WaitForStreamer: true,
        HoveringMouse: true,
        KeyboardInput: false,
        MatchViewportRes: true,
        MaxReconnectAttempts: 20
      }
    });
    const stream = new PixelStreaming(config, {
      videoElementParent: mount
    });
    streamRef.current = stream;

    const sendCurrentState = () => {
      stream.emitUIInteraction(createMetaHumanCommand(stateRef.current));
    };
    const onReady = () => {
      setRenderState("ready");
      onRenderStateRef.current?.("ready");
      sendCurrentState();
    };
    const onFailed = () => {
      setRenderState("error");
      onRenderStateRef.current?.("error");
    };
    const onPlayRejected = () => setPlayBlocked(true);

    stream.addEventListener("videoInitialized", onReady);
    stream.addEventListener("dataChannelOpen", sendCurrentState);
    stream.addEventListener("webRtcFailed", onFailed);
    stream.addEventListener("webRtcDisconnected", onFailed);
    stream.addEventListener("playStreamError", onFailed);
    stream.addEventListener("playStreamRejected", onPlayRejected);

    return () => {
      stream.removeEventListener("videoInitialized", onReady);
      stream.removeEventListener("dataChannelOpen", sendCurrentState);
      stream.removeEventListener("webRtcFailed", onFailed);
      stream.removeEventListener("webRtcDisconnected", onFailed);
      stream.removeEventListener("playStreamError", onFailed);
      stream.removeEventListener("playStreamRejected", onPlayRejected);
      stream.disconnect();
      streamRef.current = null;
      mount.replaceChildren();
    };
  }, [signalUrl]);

  useEffect(() => {
    streamRef.current?.emitUIInteraction(
      createMetaHumanCommand(stateRef.current)
    );
  }, [
    actorName,
    avatarId,
    outfitId,
    performance,
    sceneId,
    speaking,
    viewMode
  ]);

  return (
    <div
      className={`immersive-stage metahuman-stage ${renderState}`}
      data-renderer="metahuman-5.7"
      data-avatar-id={avatarId}
      data-hair-id={createMetaHumanCommand(stateRef.current).payload.hairId}
    >
      <img className="stage-background-fallback" src={sceneImage} alt="" />
      <div
        ref={mountRef}
        className="metahuman-stream"
        aria-label={`${actorName} MetaHuman 5.7 renderer`}
      />
      {renderState === "loading" && (
        <span className="digital-human-loading" role="status">
          <span />
          Connecting MetaHuman 5.7
        </span>
      )}
      {renderState === "error" && (
        <div className="metahuman-renderer-error" role="status">
          <strong>MetaHuman renderer unavailable</strong>
          <span>Start the UE 5.7 renderer and signalling service.</span>
        </div>
      )}
      {playBlocked && (
        <button
          className="metahuman-play"
          type="button"
          onClick={() => {
            streamRef.current?.play();
            setPlayBlocked(false);
          }}
        >
          Start live renderer
        </button>
      )}
      <div className="avatar-runtime-badge" aria-live="polite">
        <span className={renderState} />
        {renderState === "ready"
          ? "METAHUMAN 5.7"
          : renderState === "error"
            ? "RENDERER OFFLINE"
            : "CONNECTING UE 5.7"}
      </div>
    </div>
  );
}

export type { ViewMode };
