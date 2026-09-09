export const supportedDurations = [5, 10, 30, 60]

const clamp = (value, fallback, min, max) =>
  Math.min(max, Math.max(min, Number(value) || fallback))

export function normalizeVideoRequest(input) {
  const requestedDuration = Number(input.duration)
  const duration = supportedDurations.includes(requestedDuration) ? requestedDuration : null
  const fps = duration
    ? clamp(input.fps, 16, 8, 24)
    : clamp(input.fps, 16, 8, 30)

  return {
    prompt: String(input.prompt || '').slice(0, 4000),
    width: Math.round(clamp(input.width, 832, 256, 1280) / 32) * 32,
    height: Math.round(clamp(input.height, 480, 256, 704) / 32) * 32,
    frames: duration
      ? 5 * fps + 1
      : Math.round((clamp(input.frames, 81, 9, 121) - 1) / 4) * 4 + 1,
    duration: duration || Math.max(1, Math.round((Number(input.frames || 81) - 1) / fps)),
    segmentCount: duration ? duration / 5 : 1,
    seed: Number(input.seed || Math.floor(Math.random() * 2 ** 32)),
    steps: clamp(input.steps, 20, 4, 50),
    cfg: clamp(input.cfg, 5, 1, 10),
    fps,
    imageName: input.imageName,
  }
}
