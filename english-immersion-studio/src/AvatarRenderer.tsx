import { useEffect, useMemo, useState } from "react";
import type { AvatarAsset } from "./avatar";
import type { PerformanceState } from "./data";
import ImmersiveStage, {
  type AvatarRenderState,
  type ViewMode
} from "./ImmersiveStage";
import MetaHumanStage from "./MetaHumanStage";
import PortraitStage from "./PortraitStage";
import { createMetaHumanCommand } from "./metahuman-protocol";

export type RenderMode = "2d" | "3d";

type AvatarRendererProps = {
  actorName: string;
  avatarAsset: AvatarAsset;
  portraitFrame?: "half" | "full";
  renderMode: RenderMode;
  outfitId: string;
  performance: PerformanceState;
  sceneId: string;
  sceneImage: string;
  speaking: boolean;
  viewMode: ViewMode;
  onRenderState?: (state: AvatarRenderState) => void;
};

export default function AvatarRenderer(props: AvatarRendererProps) {
  const [signalUrl, setSignalUrl] = useState(
    import.meta.env.VITE_METAHUMAN_SIGNAL_URL?.trim() ?? ""
  );
  const [rendererState, setRendererState] =
    useState<AvatarRenderState>("loading");
  const [retryVersion, setRetryVersion] = useState(0);
  const command = useMemo(
    () =>
      createMetaHumanCommand({
        actorName: props.actorName,
        avatarId: props.avatarAsset.id,
        outfitId: props.outfitId,
        performance: props.performance,
        sceneId: props.sceneId,
        speaking: props.speaking,
        viewMode: props.viewMode
      }),
    [
      props.actorName,
      props.avatarAsset.id,
      props.outfitId,
      props.performance,
      props.sceneId,
      props.speaking,
      props.viewMode
    ]
  );

  useEffect(() => {
    if (props.renderMode !== "3d") return;
    void window.desktopWindow?.updateRendererState(command);
  }, [command, props.renderMode]);

  useEffect(() => {
    if (props.renderMode !== "3d") return;
    setRendererState("loading");
    void window.desktopWindow?.getRendererConfig().then((config) => {
      setSignalUrl(config.signalUrl.trim());
    });
  }, [props.renderMode]);

  const supportsLiveMetaHuman = props.avatarAsset.source === "bundled";

  if (props.renderMode === "2d") {
    return (
      <div className="renderer-shell">
        <PortraitStage
          performance={props.performance}
          speaking={props.speaking}
          onRenderState={props.onRenderState}
        />
      </div>
    );
  }

  if (signalUrl && supportsLiveMetaHuman) {
    return (
      <div className="renderer-shell">
        <MetaHumanStage
          key={retryVersion}
          actorName={props.actorName}
          avatarId={props.avatarAsset.id}
          outfitId={props.outfitId}
          performance={props.performance}
          sceneId={props.sceneId}
          sceneImage={props.sceneImage}
          signalUrl={signalUrl}
          speaking={props.speaking}
          viewMode={props.viewMode}
          onRenderState={(state) => {
            setRendererState(state);
            props.onRenderState?.(state);
          }}
        />
        {rendererState === "error" && (
          <div className="renderer-fallback-layer">
            <div className="renderer-fallback-notice" role="status">
              <span>Live character reconnecting</span>
              <small>Scene controls remain available.</small>
              <button
                type="button"
                onClick={() => {
                  setRendererState("loading");
                  setRetryVersion((version) => version + 1);
                }}
              >
                Reconnect now
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="renderer-shell">
      <ImmersiveStage
        sceneImage={props.sceneImage}
        actorName={props.actorName}
        performance={props.performance}
        speaking={props.speaking}
        viewMode={props.viewMode}
        avatarModelUrl={props.avatarAsset.modelUrl}
        identityImageUrl={props.avatarAsset.identityImageUrl}
        avatarSource={props.avatarAsset.source}
        outfitId={props.outfitId}
        onRenderState={props.onRenderState}
      />
    </div>
  );
}
