const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);

const rootDir = path.resolve(__dirname, '..');
const imgDir = path.join(rootDir, 'img');
const outputPath = path.join(rootDir, 'lib', 'local-image-assets.js');
const shouldCheck = process.argv.includes('--check');

function escapeJsString(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildLocalImageAssetsSource(filenames) {
  const lines = [
    'export const LOCAL_IMG_ASSETS = {',
    ...filenames.map((filename) => {
      const escaped = escapeJsString(filename);
      return `  '${escaped}': require('../img/${escaped}'),`;
    }),
    '};',
    '',
    'export function getLocalImgAsset(filename) {',
    "  if (typeof filename !== 'string') {",
    '    return null;',
    '  }',
    '',
    '  const trimmed = filename.trim();',
    '  if (!trimmed) {',
    '    return null;',
    '  }',
    '',
    '  return LOCAL_IMG_ASSETS[trimmed] || null;',
    '}',
    '',
    'export function getLocalDecoyAssets() {',
    '  return Object.entries(LOCAL_IMG_ASSETS)',
    "    .filter(([filename]) => /^decoy\\d+\\.(?:gif|jpe?g|png|webp)$/i.test(filename))",
    '    .map(([filename, asset]) => ({ filename, asset }));',
    '}',
    '',
  ];

  return lines.join('\n');
}

function getImageFilenames() {
  return fs.readdirSync(imgDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((filename) => IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

const nextSource = buildLocalImageAssetsSource(getImageFilenames());

if (shouldCheck) {
  const currentSource = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (currentSource !== nextSource) {
    console.error('lib/local-image-assets.js is stale. Run npm run assets:images.');
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(outputPath, nextSource, 'utf8');
  console.log(`Generated ${path.relative(rootDir, outputPath)} from ${path.relative(rootDir, imgDir)}.`);
}
