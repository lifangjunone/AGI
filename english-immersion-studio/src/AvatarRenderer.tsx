import { useEffect, useMemo, useState } from "react";
import type { AvatarAsset } from "./avatar";
import type { PerformanceState } from "./data";
import ImmersiveStage, {
  type AvatarRenderState,
  type ViewMode
} from "./ImmersiveStage";
import MetaHumanStage from "./MetaHumanStage";
import { createMetaHumanCommand } from "./metahuman-protocol";

type AvatarRendererProps = {
  actorName: string;
  avatarAsset: AvatarAsset;
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
    void window.desktopWindow?.updateRendererState(command);
  }, [command]);

  useEffect(() => {
    void window.desktopWindow?.getRendererConfig().then((config) => {
      setSignalUrl(config.signalUrl.trim());
    });
  }, []);

  if (signalUrl) {
    return (
      <MetaHumanStage
        actorName={props.actorName}
        avatarId={props.avatarAsset.id}
        outfitId={props.outfitId}
        performance={props.performance}
        sceneId={props.sceneId}
        sceneImage={props.sceneImage}
        signalUrl={signalUrl}
        speaking={props.speaking}
        viewMode={props.viewMode}
        onRenderState={props.onRenderState}
      />
    );
  }

  return (
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
  );
}
