const databaseName = "duix-local-studio";
const storeName = "media";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBlob(key, blob) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(blob, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readBlob(key) {
  const database = await openDatabase();
  const blob = await new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return blob;
}

export async function removeBlob(key) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function wrapLines(context, text, maxWidth) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export async function renderLocalVideo({
  imageSource,
  script,
  name,
  duration = 5,
  audioBlob,
  onProgress,
}) {
  if (!globalThis.MediaRecorder) {
    throw new Error("This browser does not support local WebM rendering.");
  }
  const image = await loadImage(imageSource);
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  let audioContext;
  let audioSource;
  if (audioBlob) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("This browser cannot add the uploaded audio to the local video.");
    }
    audioContext = new AudioContextClass();
    const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
    duration = Math.max(1, Math.min(audioBuffer.duration, 60));
    const destination = audioContext.createMediaStreamDestination();
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(destination);
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const completed = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(recorder.error);
  });

  recorder.start(250);
  if (audioContext?.state === "suspended") await audioContext.resume();
  audioSource?.start();
  const startedAt = performance.now();
  await new Promise((resolve) => {
    const draw = (now) => {
      const elapsed = (now - startedAt) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const imageRatio = image.width / image.height;
      const targetRatio = canvas.width / canvas.height;
      let sourceWidth = image.width;
      let sourceHeight = image.height;
      let sourceX = 0;
      let sourceY = 0;
      if (imageRatio > targetRatio) {
        sourceWidth = image.height * targetRatio;
        sourceX = (image.width - sourceWidth) / 2;
      } else {
        sourceHeight = image.width / targetRatio;
        sourceY = (image.height - sourceHeight) / 2;
      }
      const scale = 1.02 + Math.sin(progress * Math.PI) * 0.035;
      const inset = (1 - 1 / scale) / 2;
      context.drawImage(
        image,
        sourceX + sourceWidth * inset,
        sourceY + sourceHeight * inset,
        sourceWidth / scale,
        sourceHeight / scale,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const gradient = context.createLinearGradient(0, 400, 0, 720);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,.86)");
      context.fillStyle = gradient;
      context.fillRect(0, 360, 720, 360);
      context.fillStyle = "white";
      context.font = "700 22px Arial";
      context.fillText(name, 46, 560);
      context.font = "500 27px Arial";
      const lines = wrapLines(context, script, 628);
      lines.forEach((line, index) => context.fillText(line, 46, 610 + index * 37));
      context.fillStyle = "#8b4dff";
      context.fillRect(46, 535, 44 + progress * 580, 4);
      onProgress?.(Math.round(progress * 100));
      if (progress < 1) requestAnimationFrame(draw);
      else resolve();
    };
    requestAnimationFrame(draw);
  });
  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await completed;
  audioSource?.disconnect();
  if (audioContext) await audioContext.close();
  return blob;
}

export function speakPreview(text, voiceHint = "female") {
  if (!("speechSynthesis" in window)) throw new Error("Speech preview is unavailable.");
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((voice) =>
    voice.name.toLowerCase().includes(voiceHint.toLowerCase()),
  );
  if (match) utterance.voice = match;
  window.speechSynthesis.speak(utterance);
}
