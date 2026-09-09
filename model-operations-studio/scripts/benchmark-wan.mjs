import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const controlPlane = process.env.MODELOPS_URL || 'http://127.0.0.1:4319'
const comfy = process.env.COMFY_URL || 'http://127.0.0.1:8188'
const prompt = process.argv.slice(2).join(' ') || '雨后的上海街道，一辆复古电车缓慢驶过，电影级光影，镜头平稳向前推进'
const profiles = [
  { name: 'baseline', width: 832, height: 480, frames: 49, steps: 20, cfg: 5 },
  { name: 'reduced-frames', width: 832, height: 480, frames: 33, steps: 20, cfg: 4.5 },
  { name: 'reduced-resolution', width: 640, height: 368, frames: 33, steps: 20, cfg: 4.5 },
  { name: 'recovery', width: 512, height: 288, frames: 25, steps: 16, cfg: 4 },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function exec(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 60_000 }, (error, stdout = '', stderr = '') => resolve({ error, stdout, stderr }))
  })
}

function execRaw(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 60_000, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 }, (error, stdout = Buffer.alloc(0), stderr = Buffer.alloc(0)) => resolve({ error, stdout, stderr }))
  })
}

async function artifactHeuristics(file) {
  const width = 208
  const height = 120
  const frameBytes = width * height * 3
  const raw = await execRaw('ffmpeg', [
    '-v', 'error', '-i', file,
    '-vf', 'select=eq(n\\,0)+eq(n\\,16)+eq(n\\,32)+eq(n\\,48),scale=208:120,format=rgb24',
    '-vsync', '0', '-f', 'rawvideo', '-',
  ])
  if (raw.error || raw.stdout.length < frameBytes) return { suspicious: true, reason: 'Unable to inspect frames' }
  const frames = Math.floor(raw.stdout.length / frameBytes)
  const scores = []
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * frameBytes
    const columns = Array(width).fill(0)
    let clipped = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = offset + (y * width + x) * 3
        const r = raw.stdout[pixel]
        const g = raw.stdout[pixel + 1]
        const b = raw.stdout[pixel + 2]
        columns[x] += (r * 0.299 + g * 0.587 + b * 0.114) / height
        if (Math.max(r, g, b) > 250 && Math.min(r, g, b) < 20) clipped += 1
      }
    }
    const edge = columns.slice(1).reduce((sum, value, x) => sum + Math.abs(value - columns[x]), 0) / (width - 1)
    scores.push({ edge, clippedRatio: clipped / (width * height) })
  }
  const first = scores[0]
  const last = scores.at(-1)
  const progressiveBanding = last.edge > 10 && last.edge > first.edge * 2.5
  const progressiveSaturation = last.clippedRatio > 0.08 && last.clippedRatio > first.clippedRatio * 2
  return { frames, scores, progressiveBanding, progressiveSaturation, suspicious: progressiveBanding || progressiveSaturation }
}

async function residentMemoryBytes() {
  const result = await exec('ps', ['-axo', 'rss=,command='])
  return result.stdout.split('\n')
    .filter((line) => /ComfyUI\/main\.py/.test(line))
    .reduce((sum, line) => sum + Number(line.trim().split(/\s+/)[0] || 0) * 1024, 0)
}

async function inspectVideo(file) {
  const probe = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,nb_frames', '-of', 'json', file])
  const black = await exec('ffmpeg', ['-hide_banner', '-i', file, '-vf', 'blackdetect=d=0.2:pix_th=0.08', '-an', '-f', 'null', '-'])
  const corruption = await exec('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'])
  const artifacts = await artifactHeuristics(file)
  const contactSheet = path.join(root, 'runtime/outputs', `${path.parse(file).name}-contact-sheet.png`)
  const sheet = await exec('ffmpeg', [
    '-y', '-v', 'error', '-i', file,
    '-vf', "select=not(mod(n\\,16)),scale=416:240,tile=2x2",
    '-frames:v', '1', contactSheet,
  ])
  return {
    probe: probe.error ? null : JSON.parse(probe.stdout),
    blackFramesDetected: /black_start/.test(black.stderr),
    decodeErrors: corruption.stderr.trim(),
    artifacts,
    contactSheet: sheet.error ? null : contactSheet,
    passed: !probe.error && !/black_start/.test(black.stderr) && !corruption.stderr.trim() && !artifacts.suspicious,
  }
}

async function locateOutput(history) {
  const outputs = Object.values(history.outputs || {}).flatMap((entry) => entry.videos || entry.gifs || entry.images || [])
  const output = outputs[0]
  if (!output) return null
  const subfolder = output.subfolder || ''
  return path.join(process.env.COMFY_OUTPUT_DIR || path.join(root, 'runtime/ComfyUI/output'), subfolder, output.filename)
}

const report = {
  startedAt: new Date().toISOString(),
  device: process.platform,
  prompt,
  policy: { sampler: 'euler', scheduler: 'simple', vaeDecode: 'tiled', fp8: false },
  attempts: [],
}

for (const profile of profiles) {
  const started = Date.now()
  let peakMemoryBytes = 0
  const response = await fetch(`${controlPlane}/api/generate/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...profile }),
  })
  const submission = await response.json()
  const attempt = { profile, startedAt: new Date(started).toISOString(), promptId: submission.prompt_id, error: submission.error }
  report.attempts.push(attempt)
  if (!response.ok || !submission.prompt_id) continue

  while (true) {
    if (Date.now() - started > 90 * 60 * 1000) {
      attempt.error = 'Benchmark timed out after 90 minutes'
      break
    }
    peakMemoryBytes = Math.max(peakMemoryBytes, await residentMemoryBytes())
    const historyResponse = await fetch(`${comfy}/history/${submission.prompt_id}`)
    const payload = await historyResponse.json()
    const history = payload[submission.prompt_id]
    if (history?.status?.status_str === 'error') {
      attempt.error = 'ComfyUI execution failed'
      attempt.comfyStatus = history.status
      break
    }
    if (history?.status?.completed) {
      const output = await locateOutput(history)
      attempt.elapsedSeconds = Math.round((Date.now() - started) / 1000)
      attempt.peakMemoryBytes = peakMemoryBytes
      attempt.output = output
      attempt.quality = output ? await inspectVideo(output) : { passed: false, reason: 'No output file' }
      break
    }
    await wait(5000)
  }
  if (attempt.quality?.passed) break
}

report.finishedAt = new Date().toISOString()
const target = path.join(root, 'runtime/outputs', `wan22-benchmark-${Date.now()}.json`)
await fs.mkdir(path.dirname(target), { recursive: true })
await fs.writeFile(target, JSON.stringify(report, null, 2))
console.log(target)
