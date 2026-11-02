import { readBlob } from "./localEngine";

export const AVATARS_KEY = "duix-local-avatars-v2";
export const WORKS_KEY = "duix-local-works-v2";
export const DRAFT_KEY = "duix-local-avatar-draft-v2";

export function readLocal(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

export async function mediaUrl(blobKey, fallback) {
  if (!blobKey) return fallback;
  const blob = await readBlob(blobKey);
  return blob ? URL.createObjectURL(blob) : fallback;
}

export async function posterFromVideo(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("The selected video could not be read."));
    });
    video.currentTime = Math.min(1, Math.max(0, video.duration / 4));
    await new Promise((resolve, reject) => {
      video.onseeked = resolve;
      video.onerror = () => reject(new Error("A poster frame could not be extracted."));
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth || 720, 1280);
    canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth || 1));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return { blob, duration: video.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
