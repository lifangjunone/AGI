const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const viteConfig = fs.readFileSync(path.join(projectRoot, 'vite.config.ts'), 'utf8');
const envExample = fs.readFileSync(path.join(projectRoot, '.env.example'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const productionBuilder = fs.readFileSync(
  path.join(projectRoot, 'scripts', 'build-production.cjs'),
  'utf8',
);
const productionVerifier = fs.readFileSync(
  path.join(projectRoot, 'scripts', 'verify-production-build.cjs'),
  'utf8',
);

let failed = false;

function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed = true;
  }
}

console.log('vite.config.ts checks:');
check('imports loadEnv from vite', /import\s*\{[^}]*loadEnv[^}]*\}\s*from\s*'vite'/.test(viteConfig));
check('uses defineConfig with callback', /defineConfig\s*\(\s*\(\s*\{?\s*mode\s*\}?\s*\)/.test(viteConfig));
check('calls loadEnv()', /loadEnv\s*\(/.test(viteConfig));
check('uses env.VITE_PROXY_TARGET (not process.env)', /env\.VITE_PROXY_TARGET/.test(viteConfig) && !/process\.env\.VITE_PROXY_TARGET/.test(viteConfig));
check('default target is localhost:8000', /localhost:8000/.test(viteConfig));

console.log('\n.env.example checks:');
check('VITE_PROXY_TARGET present', /VITE_PROXY_TARGET/.test(envExample));
check('default port is 8000', /localhost:8000/.test(envExample));

console.log('\nproduction build checks:');
check('build:production script present', packageJson.scripts['build:production'] === 'node scripts/build-production.cjs');
check('production builder forces /ai-team/', /VITE_PUBLIC_BASE:\s*['"]\/ai-team\/['"]/.test(productionBuilder));
check('production verifier rejects invalid local URLs', /invalidUrls\.length\s*>\s*0/.test(productionVerifier));
check('production verifier requires /ai-team/assets/', /ai-team\/assets/.test(productionVerifier));

if (failed) {
  console.error('\nSome checks failed.');
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
