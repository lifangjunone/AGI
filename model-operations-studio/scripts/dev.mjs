import { spawn } from 'node:child_process'

const children = [
  spawn(process.execPath, ['server/control-plane.mjs'], { stdio: 'inherit' }),
  spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:web'], { stdio: 'inherit' }),
]

function stop() {
  for (const child of children) child.kill('SIGTERM')
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', stop)

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stop()
      process.exitCode = code
    }
  })
}
