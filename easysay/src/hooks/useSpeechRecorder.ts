import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../lib/api";
import { getLanguage } from "../data/languages";
import type { LanguageCode } from "../types";

interface RecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => RecognitionLike;
export const MAX_RECORDING_SECONDS = 180;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

export function useSpeechRecorder(targetLanguage: LanguageCode = "en") {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob>();
  const [error, setError] = useState<string>();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionSource, setTranscriptionSource] = useState<
    "local" | "browser" | "manual"
  >();
  const mediaRecorderRef = useRef<MediaRecorder | undefined>(undefined);
  const recognitionRef = useRef<RecognitionLike | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const transcriptRef = useRef("");
  const asrRequestRef = useRef(0);
  const manualRevisionRef = useRef(0);

  const updateTranscript = useCallback(
    (value: string | ((current: string) => string)) => {
      const next =
        typeof value === "function" ? value(transcriptRef.current) : value;
      manualRevisionRef.current += 1;
      transcriptRef.current = next;
      setTranscript(next);
      setTranscriptionSource("manual");
    },
    []
  );

  const transcribeLocally = useCallback(async (blob: Blob) => {
    const requestId = asrRequestRef.current + 1;
    const manualRevision = manualRevisionRef.current;
    asrRequestRef.current = requestId;
    setIsTranscribing(true);
    // #region debug-point A:E:recording-blob
    fetch("http://10.3.223.139:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-asr-transcription",runId:"post-fix",hypothesisId:"A,E",location:"useSpeechRecorder.ts:transcribeLocally",msg:"[DEBUG] Recording blob ready",data:{size:blob.size,type:blob.type,requestId},ts:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const result = await transcribeAudio(blob, targetLanguage);
      if (
        requestId !== asrRequestRef.current ||
        manualRevision !== manualRevisionRef.current
      ) {
        return;
      }
      transcriptRef.current = result.text;
      setTranscript(result.text);
      setTranscriptionSource("local");
    } catch (reason) {
      // #region debug-point B:C:D:E:client-error
      fetch("http://10.3.223.139:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-asr-transcription",runId:"post-fix",hypothesisId:"B,C,D,E",location:"useSpeechRecorder.ts:transcribeLocally",msg:"[DEBUG] Transcription failed in client",data:{name:reason instanceof Error?reason.name:typeof reason,message:reason instanceof Error?reason.message:String(reason),requestId},ts:Date.now()})}).catch(()=>{});
      // #endregion
      if (requestId !== asrRequestRef.current) return;
      if (!transcriptRef.current.trim()) {
        setError(
          "本地模型未完成转写。录音已保留，你可以手动补充识别文本。"
        );
      }
    } finally {
      if (requestId === asrRequestRef.current) setIsTranscribing(false);
    }
  }, [targetLanguage]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    recognitionRef.current?.stop();
    window.clearInterval(timerRef.current);
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(undefined);
    setTranscript("");
    transcriptRef.current = "";
    manualRevisionRef.current = 0;
    setAudioBlob(undefined);
    setSeconds(0);
    setIsTranscribing(false);
    setTranscriptionSource(undefined);
    asrRequestRef.current += 1;
    chunksRef.current = [];

    try {
      if (!window.isSecureContext) {
        setError(
          "当前地址是 HTTP，手机浏览器不会开放麦克风。请改用 HTTPS，或先使用下方文字输入继续。"
        );
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("当前浏览器不支持麦克风录音，请使用下方文字输入继续。");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        void transcribeLocally(blob);
      };
      recorder.start();

      const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (Recognition) {
        const recognition = new Recognition();
        recognition.lang = getLanguage(targetLanguage).speechTag;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let value = "";
          for (let i = 0; i < event.results.length; i += 1) {
            value += event.results[i][0].transcript;
          }
          const next = value.trim();
          transcriptRef.current = next;
          setTranscript(next);
          setTranscriptionSource("browser");
        };
        recognitionRef.current = recognition;
        recognition.start();
      }

      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds((value) => value + 1);
      }, 1000);
    } catch (reason) {
      const name = reason instanceof DOMException ? reason.name : "";
      setError(
        name === "NotAllowedError"
          ? "麦克风权限被拒绝。请在浏览器网站设置中允许 EasySay 使用麦克风，或使用下方文字输入。"
          : "无法使用麦克风，请检查浏览器权限或使用下方文字输入。"
      );
    }
  }, [targetLanguage, transcribeLocally]);

  const reset = useCallback(() => {
    asrRequestRef.current += 1;
    setTranscript("");
    transcriptRef.current = "";
    manualRevisionRef.current = 0;
    setSeconds(0);
    setAudioBlob(undefined);
    setError(undefined);
    setIsTranscribing(false);
    setTranscriptionSource(undefined);
  }, []);

  useEffect(() => {
    if (!isRecording || seconds < MAX_RECORDING_SECONDS) return;
    stop();
    setError("录音已达到 3 分钟上限，已自动结束并开始转写。");
  }, [isRecording, seconds, stop]);

  useEffect(() => {
    return () => {
      window.clearInterval(timerRef.current);
      asrRequestRef.current += 1;
      recognitionRef.current?.stop();
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    transcript,
    setTranscript: updateTranscript,
    seconds,
    audioBlob,
    error,
    isTranscribing,
    transcriptionSource,
    start,
    stop,
    reset,
    speechRecognitionSupported: Boolean(
      window.SpeechRecognition ?? window.webkitSpeechRecognition
    )
  };
}
