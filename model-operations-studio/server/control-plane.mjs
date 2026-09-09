import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { normalizeVideoRequest } from './video-planner.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.MODELOPS_PORT || 4319)
const host = process.env.MODELOPS_HOST || '127.0.0.1'
const runtimeRoot = path.resolve(process.env.MODELOPS_RUNTIME_DIR || path.join(root, 'runtime'))
const catalog = JSON.parse(await fsp.readFile(path.join(root, 'data/model-catalog.json'), 'utf8'))
const stateFile = path.join(runtimeRoot, 'state.json')
const logsDir = path.join(runtimeRoot, 'logs')
const outputDir = path.join(runtimeRoot, 'outputs')
const processes = new Map()
const downloads = new Map()
const jobSockets = new Map()
const advancingJobs = new Set()
const terminalJobStates = new Set(['completed', 'failed', 'cancelled'])

await Promise.all([
  fsp.mkdir(logsDir, { recursive: true }),
  fsp.mkdir(outputDir, { recursive: true }),
  fsp.mkdir(path.join(runtimeRoot, 'models'), { recursive: true }),
])

const defaultState = {
  deployments: {
    'wan22-ti2v-5b-fp16': { status: 'not-installed', endpoint: 'http://127.0.0.1:8188' },
    'qwen35-9b-q4': { status: 'not-installed', endpoint: 'http://127.0.0.1:8131' },
  },
  jobs: [],
  events: [],
  settings: {
    comfyPath: path.join(runtimeRoot, 'ComfyUI'),
    modelsPath: path.join(runtimeRoot, 'models'),
    maxMemoryGb: 40,
  },
}

async function readState() {
  try {
    return { ...defaultState, ...JSON.parse(await fsp.readFile(stateFile, 'utf8')) }
  } catch {
    return structuredClone(defaultState)
  }
}

let state = await readState()
state.jobs ||= []

async function hydrateLegacyOutputs() {
  const directory = path.join(state.settings.comfyPath, 'output', 'ModelOps')
  try {
    const entries = await fsp.readdir(directory, { withFileTypes: true })
    const known = new Set(state.jobs.flatMap((job) => [
      job.output?.filename,
      ...(job.segmentOutputs || []).map((output) => output.filename),
    ]).filter(Boolean))
    const legacy = []
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(webm|mp4|gif)$/i.test(entry.name) || known.has(entry.name)) continue
      const stat = await fsp.stat(path.join(directory, entry.name))
      legacy.push({ entry, stat })
    }
    legacy.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    for (const { entry, stat } of legacy.slice(0, 8)) {
      state.jobs.push({
        id: `history-${entry.name}`,
        type: 'video',
        modelId: 'wan22-ti2v-5b-fp16',
        title: '历史视频产物',
        prompt: '由 Wan2.2 本地工作流生成',
        status: 'completed',
        progress: 100,
        phase: '生成完成',
        createdAt: stat.birthtime.toISOString(),
        startedAt: stat.birthtime.toISOString(),
        finishedAt: stat.mtime.toISOString(),
        output: { filename: entry.name, subfolder: 'ModelOps', type: 'output' },
        legacy: true,
      })
    }
    state.jobs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    state.jobs = state.jobs.slice(0, 100)
  } catch {}
}

await hydrateLegacyOutputs()
await saveState()

async function saveState() {
  await fsp.writeFile(stateFile, JSON.stringify(state, null, 2))
}

function event(level, message, modelId) {
  state.events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), level, message, modelId })
  state.events = state.events.slice(0, 100)
  void saveState()
}

function createJob({ type, modelId, title, prompt, request }) {
  const job = {
    id: crypto.randomUUID(),
    type,
    modelId,
    title,
    prompt: String(prompt || '').slice(0, 240),
    request,
    status: 'queued',
    progress: 2,
    phase: '等待调度',
    createdAt: new Date().toISOString(),
  }
  state.jobs.unshift(job)
  state.jobs = state.jobs.slice(0, 100)
  void saveState()
  return job
}

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() })
  void saveState()
  return job
}

function publicJob(job) {
  const safe = structuredClone(job)
  delete safe.request
  return safe
}

function jobOutputPath(job) {
  if (!job?.output?.filename) return null
  const outputRoot = path.resolve(state.settings.comfyPath, 'output')
  const candidate = path.resolve(outputRoot, job.output.subfolder || '', job.output.filename)
  return candidate === outputRoot || candidate.startsWith(`${outputRoot}${path.sep}`) ? candidate : null
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 10_000_000) throw new Error('Request body is too large')
  }
  return raw ? JSON.parse(raw) : {}
}

function exec(command, args = []) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 5000 }, (error, stdout = '', stderr = '') => {
      resolve({ ok: !error, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

function execLong(command, args = [], timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout }, (error, stdout = '', stderr = '') => {
      if (error) reject(new Error(stderr.trim() || error.message))
      else resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

async function commandExists(command) {
  const result = await exec(process.platform === 'win32' ? 'where' : 'which', [command])
  return result.ok
}

async function resolveCommand(command) {
  const result = await exec(process.platform === 'win32' ? 'where' : 'which', [command])
  if (result.ok) return result.stdout.split('\n')[0]
  const candidates = process.platform === 'win32'
    ? []
    : [
        `/opt/homebrew/bin/${command}`,
        `/usr/local/bin/${command}`,
        path.join(os.homedir(), '.local/bin', command),
        path.join(os.homedir(), 'Desktop/projects/.tools/bin', command),
        path.join(os.homedir(), 'Desktop/projects/.tools/homebrew/bin', command),
      ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || command
}

async function diskMetrics() {
  if (process.platform === 'win32') {
    const result = await exec('powershell', ['-NoProfile', '-Command', "(Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json -Compress)"])
    if (!result.ok) return null
    const value = JSON.parse(result.stdout)
    return { total: value.Used + value.Free, free: value.Free }
  }
  const result = await exec('df', ['-k', runtimeRoot])
  const fields = result.stdout.split('\n').at(-1)?.trim().split(/\s+/)
  return fields?.length >= 4 ? { total: Number(fields[1]) * 1024, free: Number(fields[3]) * 1024 } : null
}

async function systemSnapshot() {
  const total = os.totalmem()
  let free = os.freemem()
  if (process.platform === 'darwin') {
    const pressure = await exec('memory_pressure', ['-Q'])
    const match = pressure.stdout.match(/free percentage:\s*(\d+)%/)
    if (match) free = Math.round(total * Number(match[1]) / 100)
  }
  const load = os.loadavg()[0]
  const runtimes = await Promise.all(['git', 'ffmpeg', 'llama-server', 'python3'].map(async (name) => [name, await commandExists(name)]))
  return {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpu: os.cpus()[0]?.model || 'Unknown CPU',
    cpuCores: os.cpus().length,
    cpuLoadPercent: Math.min(100, Math.round((load / Math.max(1, os.cpus().length)) * 100)),
    memory: { total, free, used: total - free, usedPercent: Math.round(((total - free) / total) * 100) },
    disk: await diskMetrics(),
    uptime: os.uptime(),
    runtimes: Object.fromEntries(runtimes),
  }
}

function modelInstallState(model) {
  const base = model.runtime === 'comfyui' ? state.settings.comfyPath : runtimeRoot
  const present = model.files.map((file) => {
    const absolute = path.join(base, file.target)
    try {
      const stat = fs.statSync(absolute)
      return { ...file, absolute, present: stat.size === file.size, downloadedBytes: stat.size }
    } catch {
      return { ...file, absolute, present: false, downloadedBytes: 0 }
    }
  })
  const installed = present.every((file) => file.present)
  return { ...model, files: present, installed, download: downloads.get(model.id) || null }
}

function spawnLogged(id, command, args, options = {}) {
  const logPath = path.join(logsDir, `${id}.log`)
  const log = fs.createWriteStream(logPath, { flags: 'a' })
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  processes.set(id, child)
  child.once('exit', (code, signal) => {
    processes.delete(id)
    const cleanExit = code === 0 || signal === 'SIGTERM'
    const deployment = state.deployments[id]
    if (deployment) {
      deployment.status = cleanExit ? 'stopped' : 'failed'
      deployment.pid = null
    }
    event(cleanExit ? 'info' : 'error', cleanExit ? `${id} stopped` : `${id} process exited with code ${code}`, id)
  })
  return child
}

async function downloadModel(model) {
  if (downloads.has(model.id)) throw new Error('Download already running')
  const item = { status: 'running', completed: 0, total: model.files.length, current: null }
  downloads.set(model.id, item)
  event('info', `Started verified download for ${model.name}`, model.id)
  try {
    const base = model.runtime === 'comfyui' ? state.settings.comfyPath : runtimeRoot
    for (const file of model.files) {
      const target = path.join(base, file.target)
      item.current = file.name
      await fsp.mkdir(path.dirname(target), { recursive: true })
      const partial = `${target}.part`
      const existing = await fsp.stat(partial).then((stat) => stat.size).catch(() => 0)
      const response = await fetch(file.url, {
        redirect: 'follow',
        headers: existing ? { Range: `bytes=${existing}-` } : {},
      })
      if (!response.ok || !response.body) throw new Error(`Download returned HTTP ${response.status}`)
      const append = existing > 0 && response.status === 206
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: append ? 'a' : 'w' }))
      const hash = crypto.createHash('sha256')
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(partial)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.once('end', resolve)
        stream.once('error', reject)
      })
      if (hash.digest('hex') !== file.sha256) throw new Error(`Checksum failed for ${file.name}`)
      await fsp.rename(partial, target)
      item.completed += 1
    }
    item.status = 'complete'
    state.deployments[model.id].status = 'installed'
    event('success', `${model.name} installed and checksum verified`, model.id)
  } catch (error) {
    item.status = 'failed'
    item.error = error.message
    event('error', `${model.name} install failed: ${error.message}`, model.id)
  } finally {
    await saveState()
  }
}

async function installRuntime(model) {
  if (model.runtime === 'comfyui') {
    const target = state.settings.comfyPath
    if (!fs.existsSync(path.join(target, '.git'))) {
      const clone = spawn('git', ['clone', '--depth', '1', 'https://github.com/Comfy-Org/ComfyUI.git', target], { stdio: 'inherit' })
      await new Promise((resolve, reject) => clone.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`git clone exited ${code}`))))
    }
    const uv = process.env.UV_BIN || await resolveCommand('uv')
    const pip = process.platform === 'win32'
      ? path.join(target, '.venv', 'Scripts', 'python.exe')
      : path.join(target, '.venv', 'bin', 'python')
    if (!fs.existsSync(pip)) {
      const sync = spawn(uv, ['venv', '--python', '3.13', path.join(target, '.venv')], { stdio: 'inherit' })
      await new Promise((resolve, reject) => sync.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`uv venv exited ${code}`))))
    }
    const install = spawn(uv, ['pip', 'install', '--python', pip, '-r', path.join(target, 'requirements.txt')], { stdio: 'inherit' })
    await new Promise((resolve, reject) => install.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`uv pip exited ${code}`))))
  } else {
    const llamaServer = await resolveCommand('llama-server')
    if (!fs.existsSync(llamaServer)) {
      if (process.platform !== 'darwin') throw new Error('Install llama.cpp for this OS before continuing')
      const brew = await resolveCommand('brew')
      const install = spawn(brew, ['install', 'llama.cpp'], { stdio: 'inherit' })
      await new Promise((resolve, reject) => install.once('exit', async (code) => {
        if (code === 0 || fs.existsSync(await resolveCommand('llama-server'))) resolve()
        else reject(new Error(`brew exited ${code}`))
      }))
    }
  }
}

async function startModel(model) {
  if (processes.has(model.id)) throw new Error('Model is already running')
  const existing = state.deployments[model.id]
  if (existing?.endpoint) {
    try {
      const healthPath = model.runtime === 'comfyui' ? '/system_stats' : '/health'
      const response = await fetch(`${existing.endpoint}${healthPath}`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) throw new Error('Model endpoint is already running')
    } catch (error) {
      if (error.message === 'Model endpoint is already running') throw error
    }
  }
  for (const [id, child] of processes) {
    if (id !== model.id) {
      child.kill('SIGTERM')
      state.deployments[id].status = 'stopped'
      event('info', `Stopped ${id} to release shared accelerator memory`, id)
    }
  }
  if (model.runtime === 'llama.cpp') {
    const file = path.join(runtimeRoot, model.files[0].target)
    const d = model.defaults
    const llamaServer = await resolveCommand('llama-server')
    const child = spawnLogged(model.id, llamaServer, [
      '-m', file, '--host', '127.0.0.1', '--port', String(d.port),
      '-c', String(d.context), '-ngl', String(d.gpuLayers), '--jinja',
      '--chat-template-kwargs', '{"enable_thinking":false}', '--no-webui',
    ])
    state.deployments[model.id] = { status: 'starting', endpoint: `http://127.0.0.1:${d.port}`, pid: child.pid }
  } else {
    const python = process.platform === 'win32' ? path.join(state.settings.comfyPath, '.venv', 'Scripts', 'python.exe') : path.join(state.settings.comfyPath, '.venv', 'bin', 'python')
    const reserveGb = Math.max(2, Math.round(os.totalmem() / 1024 ** 3 - state.settings.maxMemoryGb))
    const args = [
      path.join(state.settings.comfyPath, 'main.py'), '--listen', '127.0.0.1',
      '--port', '8188', '--use-pytorch-cross-attention', '--reserve-vram', String(reserveGb),
    ]
    const child = spawnLogged(model.id, python, args, {
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1', PYTORCH_MPS_HIGH_WATERMARK_RATIO: '0.0' },
    })
    state.deployments[model.id] = { status: 'starting', endpoint: 'http://127.0.0.1:8188', pid: child.pid }
  }
  event('info', `Starting ${model.name}`, model.id)
  await saveState()
}

async function refreshHealth() {
  for (const model of catalog.models) {
    const deployment = state.deployments[model.id]
    if (!deployment || !['starting', 'running'].includes(deployment.status)) continue
    try {
      const endpoint = model.runtime === 'comfyui' ? `${deployment.endpoint}/system_stats` : `${deployment.endpoint}/health`
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(1200) })
      deployment.status = response.ok ? 'running' : 'degraded'
    } catch {
      deployment.status = processes.has(model.id) ? 'starting' : 'stopped'
    }
  }
}

async function readLog(modelId) {
  try {
    const content = await fsp.readFile(path.join(logsDir, `${modelId}.log`), 'utf8')
    return content.split('\n').slice(-120).join('\n')
  } catch {
    return ''
  }
}

function findComfyOutput(history) {
  const files = Object.values(history?.outputs || {}).flatMap((entry) => entry.videos || entry.gifs || entry.images || [])
  const file = files[0]
  return file ? { filename: file.filename, subfolder: file.subfolder || '', type: file.type || 'output' } : null
}

function segmentPhase(job, segmentIndex, phase) {
  return job.segmentCount > 1 ? `第 ${segmentIndex + 1}/${job.segmentCount} 段 · ${phase}` : phase
}

function segmentProgress(job, segmentIndex, localProgress) {
  return Math.min(99, Math.round(((segmentIndex * 100) + localProgress) / Math.max(1, job.segmentCount || 1)))
}

async function extractContinuationFrame(job, output, segmentIndex) {
  const source = jobOutputPath({ output })
  if (!source) throw new Error('Segment output path is invalid')
  const filename = `continuation-${job.id}-${segmentIndex + 1}.png`
  const target = path.join(state.settings.comfyPath, 'input', filename)
  const ffmpeg = await resolveCommand('ffmpeg')
  await execLong(ffmpeg, ['-y', '-sseof', '-0.08', '-i', source, '-frames:v', '1', target])
  return filename
}

async function concatenateSegments(job) {
  if (job.segmentOutputs.length === 1) return job.segmentOutputs[0]
  const outputRoot = path.join(state.settings.comfyPath, 'output')
  const modelOpsDir = path.join(outputRoot, 'ModelOps')
  await fsp.mkdir(modelOpsDir, { recursive: true })
  const listPath = path.join(outputDir, `${job.id}-segments.txt`)
  const lines = job.segmentOutputs.map((output) => {
    const file = path.join(outputRoot, output.subfolder || '', output.filename)
    return `file '${file.replaceAll("'", "'\\''")}'`
  })
  await fsp.writeFile(listPath, `${lines.join('\n')}\n`)
  const filename = `modelops-${job.id}.webm`
  const target = path.join(modelOpsDir, filename)
  const ffmpeg = await resolveCommand('ffmpeg')
  try {
    await execLong(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-t', String(job.request.duration), '-c', 'copy', target], 300000)
  } catch {
    await execLong(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-t', String(job.request.duration), '-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', target], 600000)
  }
  return { filename, subfolder: 'ModelOps', type: 'output' }
}

async function completeVideoSegment(job, history, segmentIndex) {
  if (terminalJobStates.has(job.status) || advancingJobs.has(job.id)) return
  const failed = history?.status?.status_str === 'error'
  if (failed) {
    updateJob(job, {
      status: 'failed',
      phase: segmentPhase(job, segmentIndex, '执行失败'),
      error: history?.status?.messages?.at(-1)?.[1]?.exception_message || 'ComfyUI execution failed',
      finishedAt: new Date().toISOString(),
    })
    return
  }
  const output = findComfyOutput(history)
  if (!output) {
    updateJob(job, { status: 'failed', phase: '未找到分段产物', error: 'ComfyUI completed without an output file', finishedAt: new Date().toISOString() })
    return
  }
  advancingJobs.add(job.id)
  jobSockets.get(job.id)?.close()
  jobSockets.delete(job.id)
  job.segmentOutputs ||= []
  if (!job.segmentOutputs.some((item) => item.filename === output.filename)) job.segmentOutputs.push(output)
  const nextSegment = segmentIndex + 1
  updateJob(job, {
    completedSegments: nextSegment,
    progress: segmentProgress(job, segmentIndex, 100),
    phase: nextSegment < job.segmentCount ? `准备第 ${nextSegment + 1}/${job.segmentCount} 段` : job.segmentCount > 1 ? '合并视频分段' : '整理产物',
  })
  try {
    if (nextSegment < job.segmentCount) {
      const continuation = await extractContinuationFrame(job, output, segmentIndex)
      if (!terminalJobStates.has(job.status)) await dispatchVideoSegment(job, nextSegment, continuation)
    } else {
      const finalOutput = await concatenateSegments(job)
      updateJob(job, { status: 'completed', phase: '生成完成', progress: 100, output: finalOutput, finishedAt: new Date().toISOString() })
    }
  } catch (error) {
    updateJob(job, { status: 'failed', phase: '分段处理失败', error: error.message, finishedAt: new Date().toISOString() })
  } finally {
    advancingJobs.delete(job.id)
  }
}

async function refreshJobs() {
  const active = state.jobs.filter((job) => job.type === 'video' && job.promptId && !terminalJobStates.has(job.status))
  if (!active.length) return
  let queue
  try {
    queue = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(1200) }).then((response) => response.json())
  } catch {
    return
  }
  const running = new Set((queue.queue_running || []).map((item) => item[1]))
  const pending = new Map((queue.queue_pending || []).map((item, index) => [item[1], index + 1]))
  for (const job of active) {
    if (running.has(job.promptId)) {
      if (job.status !== 'running') updateJob(job, { status: 'running', phase: '模型执行中', startedAt: job.startedAt || new Date().toISOString(), progress: Math.max(8, job.progress) })
      continue
    }
    if (pending.has(job.promptId)) {
      updateJob(job, { status: 'queued', phase: `队列第 ${pending.get(job.promptId)} 位`, queuePosition: pending.get(job.promptId) })
      continue
    }
    try {
      const payload = await fetch(`http://127.0.0.1:8188/history/${job.promptId}`, { signal: AbortSignal.timeout(1200) }).then((response) => response.json())
      const history = payload[job.promptId]
      if (history?.status?.completed || history?.status?.status_str === 'error') await completeVideoSegment(job, history, job.segmentIndex || 0)
    } catch {}
  }
}

function phaseForNode(node) {
  return ({
    '38': ['解析提示词', 10],
    '37': ['加载视频模型', 16],
    '48': ['准备采样器', 20],
    '55': ['创建视频潜空间', 24],
    '3': ['视频采样', 28],
    '8': ['VAE 分块解码', 92],
    '47': ['编码视频文件', 97],
  })[node] || ['执行工作流', 8]
}

async function openComfyProgress(job, clientId, segmentIndex) {
  const socket = new WebSocket(`ws://127.0.0.1:8188/ws?clientId=${clientId}`)
  jobSockets.set(job.id, socket)
  socket.on('message', async (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      const data = message.data || {}
      if (data.prompt_id && job.promptId && data.prompt_id !== job.promptId) return
      if (message.type === 'execution_start') {
        updateJob(job, { status: 'running', phase: segmentPhase(job, segmentIndex, '启动工作流'), progress: segmentProgress(job, segmentIndex, 6), startedAt: job.startedAt || new Date().toISOString() })
      } else if (message.type === 'executing' && data.node) {
        const [phase, localProgress] = phaseForNode(String(data.node))
        updateJob(job, { status: 'running', phase: segmentPhase(job, segmentIndex, phase), progress: Math.max(job.progress, segmentProgress(job, segmentIndex, localProgress)), currentNode: String(data.node) })
      } else if (message.type === 'progress' && data.max) {
        const localProgress = Math.min(90, 28 + Math.round((Number(data.value) / Number(data.max)) * 62))
        updateJob(job, { status: 'running', phase: segmentPhase(job, segmentIndex, `视频采样 ${data.value}/${data.max}`), progress: Math.max(job.progress, segmentProgress(job, segmentIndex, localProgress)), currentStep: Number(data.value), totalSteps: Number(data.max) })
      } else if (message.type === 'execution_error') {
        updateJob(job, { status: 'failed', phase: segmentPhase(job, segmentIndex, '执行失败'), error: data.exception_message || 'ComfyUI execution failed', finishedAt: new Date().toISOString() })
      } else if (message.type === 'execution_success') {
        const payload = await fetch(`http://127.0.0.1:8188/history/${job.promptId}`).then((response) => response.json())
        await completeVideoSegment(job, payload[job.promptId], segmentIndex)
      }
    } catch {}
  })
  socket.on('close', () => {
    if (jobSockets.get(job.id) === socket) jobSockets.delete(job.id)
  })
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1500)
    socket.once('open', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('error', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  return socket
}

async function runTextJob(input, job = createJob({
  type: 'text',
  modelId: 'qwen35-9b-q4',
  title: '文本生成',
  prompt: input.prompt,
  request: { prompt: String(input.prompt || '').slice(0, 4000) },
})) {
  const endpoint = state.deployments['qwen35-9b-q4'].endpoint
  updateJob(job, { status: 'running', phase: '模型推理', progress: 35, startedAt: new Date().toISOString() })
  try {
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen-local', messages: [{ role: 'user', content: String(input.prompt || '') }], max_tokens: 512, temperature: 0.7 }),
      signal: AbortSignal.timeout(120000),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error?.message || payload.error || `Text runtime returned ${response.status}`)
    const content = payload.choices?.[0]?.message?.content || ''
    updateJob(job, {
      status: 'completed',
      phase: '生成完成',
      progress: 100,
      result: content.slice(0, 6000),
      metrics: payload.timings || null,
      finishedAt: new Date().toISOString(),
    })
    return { status: response.status, payload, job }
  } catch (error) {
    updateJob(job, { status: 'failed', phase: '执行失败', error: error.message, finishedAt: new Date().toISOString() })
    return { status: 503, payload: { error: `Text runtime unavailable: ${error.message}` }, job }
  }
}

async function dispatchVideoSegment(job, segmentIndex, imageName) {
  const request = job.request
  updateJob(job, {
    segmentIndex,
    status: 'queued',
    phase: segmentPhase(job, segmentIndex, '提交到 ComfyUI'),
    progress: segmentProgress(job, segmentIndex, 4),
  })
  const workflow = JSON.parse(await fsp.readFile(path.join(root, 'workflows/wan22-mps-api.json'), 'utf8'))
  workflow['6'].inputs.text = request.prompt
  workflow['55'].inputs.width = request.width
  workflow['55'].inputs.height = request.height
  workflow['55'].inputs.length = request.frames
  workflow['3'].inputs.seed = request.seed + segmentIndex
  workflow['3'].inputs.steps = request.steps
  workflow['3'].inputs.cfg = request.cfg
  workflow['47'].inputs.fps = request.fps
  if (imageName) {
    workflow['9'] = { class_type: 'LoadImage', inputs: { image: imageName } }
    workflow['55'].inputs.start_image = ['9', 0]
  }
  const clientId = crypto.randomUUID()
  await openComfyProgress(job, clientId, segmentIndex)
  try {
    const response = await fetch('http://127.0.0.1:8188/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: AbortSignal.timeout(10000),
    })
    const payload = await response.json()
    if (!response.ok || !payload.prompt_id) throw new Error(payload.error || `ComfyUI returned ${response.status}`)
    job.segmentPromptIds ||= []
    job.segmentPromptIds[segmentIndex] = payload.prompt_id
    updateJob(job, {
      promptId: payload.prompt_id,
      status: 'queued',
      phase: segmentPhase(job, segmentIndex, '已进入生成队列'),
      progress: segmentProgress(job, segmentIndex, 5),
    })
    return { status: response.status, payload: { ...payload, job: publicJob(job) }, job }
  } catch (error) {
    jobSockets.get(job.id)?.close()
    updateJob(job, { status: 'failed', phase: '提交失败', error: error.message, finishedAt: new Date().toISOString() })
    return { status: 503, payload: { error: `Video runtime unavailable: ${error.message}`, job: publicJob(job) }, job }
  }
}

async function submitVideoJob(input) {
  const request = normalizeVideoRequest(input)
  if (input.imageBase64) {
    const match = String(input.imageBase64).match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/)
    if (!match) throw Object.assign(new Error('Reference image must be PNG, JPEG or WebP'), { status: 400 })
    const image = Buffer.from(match[2], 'base64')
    if (image.length > 7_000_000) throw Object.assign(new Error('Reference image exceeds 7 MB'), { status: 400 })
    const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
    request.imageName = `modelops-${crypto.randomUUID()}.${extension}`
    await fsp.writeFile(path.join(state.settings.comfyPath, 'input', request.imageName), image)
  }
  const job = createJob({
    type: 'video',
    modelId: 'wan22-ti2v-5b-fp16',
    title: `${request.imageName ? '图生视频' : '文生视频'} · ${request.duration}秒`,
    prompt: request.prompt,
    request,
  })
  updateJob(job, { segmentCount: request.segmentCount, completedSegments: 0, segmentOutputs: [] })
  return dispatchVideoSegment(job, 0, request.imageName)
}

async function routeApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/state') {
    await refreshHealth()
    await refreshJobs()
    state.jobs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    return json(res, 200, { system: await systemSnapshot(), models: catalog.models.map(modelInstallState), state })
  }
  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/(cancel|retry|output)$/)
  if (jobMatch) {
    const [, id, action] = jobMatch
    const job = state.jobs.find((item) => item.id === id)
    if (!job) return json(res, 404, { error: 'Unknown job' })
    if (action === 'output') {
      const file = jobOutputPath(job)
      if (!file || !fs.existsSync(file)) return json(res, 404, { error: 'Output not found' })
      const extension = path.extname(file).toLowerCase()
      const types = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }
      const stat = fs.statSync(file)
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
      if (range) {
        const start = Number(range[1])
        const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1
        if (start >= stat.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
          return res.end()
        }
        res.writeHead(206, {
          'Content-Type': types[extension] || 'application/octet-stream',
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
        })
        if (req.method === 'HEAD') return res.end()
        fs.createReadStream(file, { start, end }).pipe(res)
        return
      }
      res.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' })
      if (req.method === 'HEAD') return res.end()
      fs.createReadStream(file).pipe(res)
      return
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
    if (action === 'cancel') {
      if (terminalJobStates.has(job.status)) return json(res, 409, { error: 'Job is already finished' })
      try {
        if (job.type === 'video' && job.promptId) {
          await fetch('http://127.0.0.1:8188/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete: [job.promptId] }),
            signal: AbortSignal.timeout(1500),
          })
          if (job.status === 'running') {
            await fetch('http://127.0.0.1:8188/interrupt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt_id: job.promptId }),
              signal: AbortSignal.timeout(1500),
            })
          }
        }
      } catch {}
      jobSockets.get(job.id)?.close()
      updateJob(job, { status: 'cancelled', phase: '已取消', finishedAt: new Date().toISOString() })
      event('info', `Cancelled ${job.title} job`, job.modelId)
      return json(res, 200, publicJob(job))
    }
    if (action === 'retry') {
      if (!terminalJobStates.has(job.status)) return json(res, 409, { error: 'Only finished jobs can be retried' })
      if (!job.request) return json(res, 409, { error: 'Original task parameters are unavailable' })
      if (job.type === 'video') {
        const result = await submitVideoJob(job.request || {})
        return json(res, result.status, result.payload)
      }
      const retry = createJob({
        type: 'text',
        modelId: 'qwen35-9b-q4',
        title: '文本生成（重试）',
        prompt: job.prompt,
        request: job.request || { prompt: job.prompt },
      })
      void runTextJob(retry.request, retry)
      return json(res, 202, { job: publicJob(retry) })
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/settings') {
    const input = await body(req)
    const maxMemoryGb = Number(input.maxMemoryGb)
    if (!Number.isFinite(maxMemoryGb) || maxMemoryGb < 8 || maxMemoryGb > 256) {
      return json(res, 400, { error: 'maxMemoryGb must be between 8 and 256' })
    }
    state.settings.maxMemoryGb = maxMemoryGb
    await saveState()
    event('success', `Memory policy updated to ${maxMemoryGb} GB`)
    return json(res, 200, state.settings)
  }
  const modelMatch = url.pathname.match(/^\/api\/models\/([^/]+)\/(install|start|stop|logs)$/)
  if (modelMatch) {
    const [, id, action] = modelMatch
    const model = catalog.models.find((entry) => entry.id === id)
    if (!model) return json(res, 404, { error: 'Unknown model' })
    try {
      if (action === 'logs') return json(res, 200, { logs: await readLog(id) })
      if (action === 'install') {
        void (async () => {
          try {
            await installRuntime(model)
            await downloadModel(model)
          } catch (error) {
            event('error', `${model.name} runtime install failed: ${error.message}`, id)
          }
        })()
        return json(res, 202, { status: 'installing' })
      }
      if (action === 'start') await startModel(model)
      if (action === 'stop') {
        const child = processes.get(id)
        if (child) child.kill('SIGTERM')
        else if (state.deployments[id]?.pid) {
          try { process.kill(state.deployments[id].pid, 'SIGTERM') } catch {}
        }
        state.deployments[id].status = 'stopped'
        state.deployments[id].pid = null
        event('info', `Stopped ${model.name}`, id)
      }
      return json(res, 200, state.deployments[id])
    } catch (error) {
      return json(res, 409, { error: error.message })
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/generate/text') {
    const input = await body(req)
    const result = await runTextJob(input)
    return json(res, result.status, { ...result.payload, job: publicJob(result.job) })
  }
  if (req.method === 'POST' && url.pathname === '/api/generate/video') {
    const input = await body(req)
    try {
      const result = await submitVideoJob(input)
      return json(res, result.status, result.payload)
    } catch (error) {
      return json(res, error.status || 503, { error: error.message })
    }
  }
  return json(res, 404, { error: 'Not found' })
}

async function serveStatic(req, res, url) {
  const dist = path.join(root, 'dist')
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  const resolved = path.resolve(dist, requested)
  const file = resolved.startsWith(dist) && fs.existsSync(resolved) ? resolved : path.join(dist, 'index.html')
  const ext = path.extname(file)
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`)
  try {
    if (url.pathname.startsWith('/api/')) await routeApi(req, res, url)
    else await serveStatic(req, res, url)
  } catch (error) {
    json(res, 500, { error: error.message })
  }
})

server.listen(port, host, () => {
  console.log(`Model Operations Studio: http://${host}:${port}`)
})

export { modelInstallState, systemSnapshot }
