const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const indexPath = path.join(projectRoot, 'dist', 'index.html');
const expectedPrefix = '/ai-team/';

if (!fs.existsSync(indexPath)) {
  console.error('Production build verification failed: dist/index.html is missing.');
  process.exit(1);
}

const index = fs.readFileSync(indexPath, 'utf8');
const localUrls = [...index.matchAll(/\b(?:src|href)="(\/[^"]+)"/g)]
  .map((match) => match[1]);
const invalidUrls = localUrls.filter((url) => !url.startsWith(expectedPrefix));

if (localUrls.length === 0) {
  console.error('Production build verification failed: no local assets were found.');
  process.exit(1);
}

if (invalidUrls.length > 0) {
  console.error('Production build verification failed: local URLs must use /ai-team/.');
  for (const url of invalidUrls) console.error(`  ${url}`);
  process.exit(1);
}

if (!index.includes(`${expectedPrefix}assets/`)) {
  console.error('Production build verification failed: /ai-team/assets/ is missing.');
  process.exit(1);
}

console.log(`Production build base verified: ${localUrls.length} local URLs use ${expectedPrefix}`);
