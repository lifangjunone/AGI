const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'build'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    VITE_PUBLIC_BASE: '/ai-team/',
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const verify = spawnSync(process.execPath, [
  path.join(__dirname, 'verify-production-build.cjs'),
], {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (verify.error) throw verify.error;
process.exit(verify.status ?? 1);
