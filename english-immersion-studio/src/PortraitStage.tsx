import { AudioLines } from "lucide-react";
import type { AvatarRenderState } from "./ImmersiveStage";
import type { PerformanceState } from "./data";

type PortraitStageProps = {
  actorName: string;
  portraitUrl?: string;
  sceneImage: string;
  performance: PerformanceState;
  speaking: boolean;
  onRenderState?: (state: AvatarRenderState) => void;
};

export default function PortraitStage({
  actorName,
  portraitUrl,
  sceneImage,
  performance,
  speaking,
  onRenderState
}: PortraitStageProps) {
  return (
    <div
      className={`portrait-stage performance-${performance} ${speaking ? "speaking" : ""}`}
      data-renderer="portrait-2d"
      data-render-state="ready"
    >
      <img className="portrait-scene" src={sceneImage} alt="" />
      <div className="portrait-scene-shade" />
      {portraitUrl ? (
        <div className="portrait-subject">
          <img
            src={portraitUrl}
            alt={`${actorName} portrait`}
            onLoad={() => onRenderState?.("ready")}
            onError={() => onRenderState?.("error")}
          />
        </div>
      ) : (
        <div className="portrait-missing" role="status">
          Portrait unavailable
        </div>
      )}
      {speaking && (
        <div className="portrait-speaking" aria-hidden="true">
          <AudioLines size={14} />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
      <div className="avatar-runtime-badge">
        <span className="ready" />
        2D PORTRAIT
      </div>
    </div>
  );
}
