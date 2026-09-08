import {
  createModel,
  type KaldiRecognizer,
  type Model
} from "vosk-browser";

const MODEL_MIME_TYPE = "application/gzip";
const MODEL_URL = `${import.meta.env.BASE_URL}speech/vosk-model-small-en-us-0.15.tar.gz`;

export type LocalSpeechSession = {
  stop: () => Promise<string>;
};

export type LocalSpeechCallbacks = {
  onTranscript: (transcript: string) => void;
};

let modelPromise: Promise<Model> | null = null;
let modelObjectUrl = "";

function normalizeTranscript(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function createBundledModelUrl() {
  if (modelObjectUrl) return modelObjectUrl;
  if (!window.desktopWindow?.loadSpeechModel) return MODEL_URL;

  const bytes = await window.desktopWindow.loadSpeechModel();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  modelObjectUrl = URL.createObjectURL(
    new Blob([copy.buffer], { type: MODEL_MIME_TYPE })
  );
  return modelObjectUrl;
}

export function prepareLocalSpeechRecognition() {
  if (!modelPromise) {
    modelPromise = createBundledModelUrl()
      .then((modelUrl) => createModel(modelUrl, -1))
      .catch((error) => {
        modelPromise = null;
        throw error;
      });
  }
  return modelPromise;
}

export async function startLocalSpeechRecognition({
  onTranscript
}: LocalSpeechCallbacks): Promise<LocalSpeechSession> {
  const [model, stream] = await Promise.all([
    prepareLocalSpeechRecognition(),
    navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    })
  ]);

  const audioContext = new AudioContext({ sampleRate: 16_000 });
  await audioContext.resume();
  const recognizer: KaldiRecognizer = new model.KaldiRecognizer(
    audioContext.sampleRate
  );
  recognizer.setWords(true);

  const finalSegments: string[] = [];
  let partialSegment = "";
  let stopped = false;
  let resolveFinal: ((value: string) => void) | null = null;
  let settleTimer: number | null = null;
  let maximumWaitTimer: number | null = null;

  const emitTranscript = () => {
    const transcript = normalizeTranscript([
      ...finalSegments,
      partialSegment
    ]);
    onTranscript(transcript);
    return transcript;
  };
  const settleFinalResult = () => {
    if (!stopped || !resolveFinal) return;
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      resolveFinal?.(emitTranscript());
    }, 450);
  };

  recognizer.on("partialresult", (message) => {
    partialSegment =
      message.event === "partialresult" ? message.result.partial : "";
    emitTranscript();
  });
  recognizer.on("result", (message) => {
    if (message.event !== "result") return;
    const segment = message.result.text.trim();
    if (segment) finalSegments.push(segment);
    partialSegment = "";
    emitTranscript();
    settleFinalResult();
  });
  recognizer.on("error", (message) => {
    if (message.event !== "error") return;
    resolveFinal?.(emitTranscript());
  });

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentOutput = audioContext.createGain();
  silentOutput.gain.value = 0;
  processor.onaudioprocess = (event) => {
    if (stopped) return;
    recognizer.acceptWaveform(event.inputBuffer);
  };
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(audioContext.destination);

  return {
    stop: async () => {
      if (stopped) return emitTranscript();
      stopped = true;
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      silentOutput.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();

      const transcript = await new Promise<string>((resolve) => {
        resolveFinal = resolve;
        recognizer.retrieveFinalResult();
        maximumWaitTimer = window.setTimeout(
          () => resolve(emitTranscript()),
          3_000
        );
      });
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      if (maximumWaitTimer !== null) window.clearTimeout(maximumWaitTimer);
      recognizer.remove();
      return transcript;
    }
  };
}
