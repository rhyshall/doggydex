const fs = require('fs');
const path = require('path');

function toSnakeCase(str) {
  return str
    .replace(/\s+/g, '_')
    .replace(/\(|\)/g, '')
    .replace(/-+/g, '_')
    .replace(/__+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

const breedsListPath = path.join(__dirname, '../data/dog-breeds-list.txt');
const tiersPath = path.join(__dirname, '../data/dog-breeds-tiers.json');

const breedNames = fs.readFileSync(breedsListPath, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

const tiers = JSON.parse(fs.readFileSync(tiersPath, 'utf8'));
const tierKeys = new Set(Object.keys(tiers));

const missing = breedNames.filter(name => !tierKeys.has(toSnakeCase(name)));

if (missing.length) {
  console.log('Missing breeds in dog-breeds-tiers.json:');
  missing.forEach(b => console.log(b));
} else {
  console.log('No breeds are missing in dog-breeds-tiers.json!');
}
