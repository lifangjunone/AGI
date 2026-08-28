import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pause, Play } from "lucide-react";
import { getAudioUrl } from "../lib/storage";

interface Props {
  audioId?: string;
  label: string;
}

export default function AudioPlayButton({ audioId, label }: Props) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "playing" | "error"
  >("idle");
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const urlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const toggle = async () => {
    if (!audioId || status === "loading") return;

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setStatus("idle");
      return;
    }

    setStatus("loading");
    try {
      if (!urlRef.current) {
        const audioUrl = await getAudioUrl(audioId);
        if (!audioUrl) {
          setStatus("error");
          return;
        }
        urlRef.current = audioUrl;
      }

      if (!audioRef.current) {
        const audio = new Audio(urlRef.current);
        audio.onended = () => setStatus("idle");
        audioRef.current = audio;
      }
      await audioRef.current.play();
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  };

  const ariaLabel =
    status === "playing" ? `暂停${label}` : status === "error" ? `${label}不可用` : `播放${label}`;

  return (
    <button
      className="record-play"
      type="button"
      onClick={() => void toggle()}
      disabled={!audioId || status === "loading"}
      aria-label={ariaLabel}
      title={!audioId ? "这次练习没有录音" : ariaLabel}
    >
      {status === "loading" ? (
        <LoaderCircle className="spin" size={17} />
      ) : status === "playing" ? (
        <Pause size={17} fill="currentColor" />
      ) : (
        <Play size={17} fill="currentColor" />
      )}
    </button>
  );
}
