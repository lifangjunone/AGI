import { useEffect } from "react";
import type { AvatarRenderState } from "./ImmersiveStage";
import type { PerformanceState } from "./data";

type PortraitStageProps = {
  performance: PerformanceState;
  speaking: boolean;
  onRenderState?: (state: AvatarRenderState) => void;
};

export default function PortraitStage({
  performance,
  speaking,
  onRenderState
}: PortraitStageProps) {
  useEffect(() => {
    onRenderState?.("ready");
  }, [onRenderState]);

  return (
    <div
      className={`focus-canvas performance-${performance} ${speaking ? "speaking" : ""}`}
      data-renderer="focus-canvas-2d"
      data-render-state="ready"
      aria-hidden="true"
    >
      <div className="focus-canvas-grain" />
      <div className="focus-canvas-pulse focus-canvas-pulse-one" />
      <div className="focus-canvas-pulse focus-canvas-pulse-two" />
    </div>
  );
}
