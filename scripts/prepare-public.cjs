/**
 * Assembles the deployable site into public/ for Vercel.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public');

const entries = [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'styles',
  'scripts',
  'dist',
  'assets',
  'fontawesome',
];

if (fs.existsSync(out)) {
  fs.rmSync(out, { recursive: true, force: true });
}
fs.mkdirSync(out, { recursive: true });

for (const name of entries) {
  const src = path.join(root, name);
  const dest = path.join(out, name);
  if (!fs.existsSync(src)) {
    console.error(`prepare-public: missing required path "${name}"`);
    process.exit(1);
  }
  fs.cpSync(src, dest, { recursive: true });
}

console.log('prepare-public: ready at public/');
