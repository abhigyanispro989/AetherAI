import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const files = [];
function walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.openai' && entry.name !== 'server') walk(full);
    } else if (entry.name !== 'index.js' && !full.endsWith('aether-horizon.png')) files.push(full);
  }
}
walk(dist);
const assets = {};
for (const file of files) {
  let body = readFileSync(file);
  if (file.endsWith('.css')) body = Buffer.from(body.toString('utf8').replaceAll("url('assets/aether-horizon.png')", "url('https://aethertech.aether-dev.workers.dev/assets/aether-horizon.png')"));
  const key = '/' + path.relative(dist, file).split(path.sep).join('/');
  assets[key] = { body: gzipSync(body, { level: 9 }).toString('base64'), contentType: mime[path.extname(file).toLowerCase()] || 'application/octet-stream' };
}
const workerSource = readFileSync(path.join(root, 'worker', 'index.js'), 'utf8');
if (!workerSource.includes('__STATIC_ASSETS__')) throw new Error('Worker source is missing the static asset placeholder.');
const entry = workerSource.replace('__STATIC_ASSETS__', JSON.stringify(assets));
const server = path.join(dist, 'server');
mkdirSync(server, { recursive: true });
writeFileSync(path.join(server, 'index.js'), entry);
mkdirSync(path.join(dist, '.openai'), { recursive: true });
copyFileSync(path.join(root, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));
console.log(`Built Worker with ${files.length} compressed static assets (${Buffer.byteLength(entry)} bytes).`);
