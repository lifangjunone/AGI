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

async function saveState() {
  await fsp.writeFile(stateFile, JSON.stringify(state, null, 2))
}

function event(level, message, modelId) {
  state.events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), level, message, modelId })
  state.events = state.events.slice(0, 100)
  void saveState()
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 1_000_000) throw new Error('Request body is too large')
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
  child.once('exit', (code) => {
    processes.delete(id)
    const deployment = state.deployments[id]
    if (deployment) {
      deployment.status = code === 0 ? 'stopped' : 'failed'
      deployment.pid = null
    }
    event(code === 0 ? 'info' : 'error', `${id} process exited with code ${code}`, id)
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

async function routeApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/state') {
    await refreshHealth()
    return json(res, 200, { system: await systemSnapshot(), models: catalog.models.map(modelInstallState), state })
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
    const endpoint = state.deployments['qwen35-9b-q4'].endpoint
    try {
      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen-local', messages: [{ role: 'user', content: String(input.prompt || '') }], max_tokens: 512, temperature: 0.7 }),
        signal: AbortSignal.timeout(120000),
      })
      return json(res, response.status, await response.json())
    } catch (error) {
      return json(res, 503, { error: `Text runtime unavailable: ${error.message}` })
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/generate/video') {
    const input = await body(req)
    const clamp = (value, fallback, min, max) => Math.min(max, Math.max(min, Number(value) || fallback))
    const workflow = JSON.parse(await fsp.readFile(path.join(root, 'workflows/wan22-mps-api.json'), 'utf8'))
    workflow['6'].inputs.text = String(input.prompt || '').slice(0, 4000)
    workflow['55'].inputs.width = Math.round(clamp(input.width, 832, 256, 1280) / 32) * 32
    workflow['55'].inputs.height = Math.round(clamp(input.height, 480, 256, 704) / 32) * 32
    workflow['55'].inputs.length = Math.round((clamp(input.frames, 49, 9, 121) - 1) / 4) * 4 + 1
    workflow['3'].inputs.seed = Number(input.seed || Math.floor(Math.random() * 2 ** 32))
    workflow['3'].inputs.steps = clamp(input.steps, 20, 4, 50)
    workflow['3'].inputs.cfg = clamp(input.cfg, 5, 1, 10)
    workflow['47'].inputs.fps = clamp(input.fps, 16, 8, 30)
    try {
      const response = await fetch('http://127.0.0.1:8188/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
        signal: AbortSignal.timeout(10000),
      })
      return json(res, response.status, await response.json())
    } catch (error) {
      return json(res, 503, { error: `Video runtime unavailable: ${error.message}` })
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
