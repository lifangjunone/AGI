import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')

test('model catalog pins safe MPS artifacts and checksums', async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(root, 'data/model-catalog.json'), 'utf8'))
  const video = catalog.models.find((model) => model.kind === 'video')
  assert.equal(video.defaults.sampler, 'euler')
  assert.equal(video.defaults.vaeDecode, 'tiled')
  assert.equal(video.files.some((file) => file.name.includes('fp8')), false)
  assert.equal(video.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)), true)
})

test('Wan workflow uses FP16, Euler and tiled VAE decode', async () => {
  const workflow = JSON.parse(await fs.readFile(path.join(root, 'workflows/wan22-mps-api.json'), 'utf8'))
  assert.match(workflow['37'].inputs.unet_name, /fp16/)
  assert.match(workflow['38'].inputs.clip_name, /fp16/)
  assert.equal(workflow['3'].inputs.sampler_name, 'euler')
  assert.equal(workflow['8'].class_type, 'VAEDecodeTiled')
  assert.deepEqual(
    [workflow['55'].inputs.width, workflow['55'].inputs.height, workflow['55'].inputs.length],
    [832, 480, 49],
  )
})

test('control plane exposes host and model state', async (context) => {
  const port = 4398
  const child = spawn(process.execPath, ['server/control-plane.mjs'], {
    cwd: root,
    env: { ...process.env, MODELOPS_PORT: String(port) },
    stdio: 'ignore',
  })
  context.after(() => child.kill('SIGTERM'))
  let response
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/state`)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  assert.equal(response?.status, 200)
  const payload = await response.json()
  assert.equal(payload.system.arch, process.arch)
  assert.equal(payload.models.length, 2)
})
