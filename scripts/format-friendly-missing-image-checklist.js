// Convert the technical missing image checklist into a friendlier photo to-do list.
// Usage: node scripts/format-friendly-missing-image-checklist.js <input.md> <output.md>

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/format-friendly-missing-image-checklist.js <input.md> <output.md>');
  process.exit(1);
}

const source = fs.readFileSync(inputPath, 'utf8');
const lines = source.split(/\r?\n/);

const breeds = [];
let currentBreed = null;
let totalMissing = null;

for (const line of lines) {
  const totalMatch = line.match(/^Total missing:\s*(\d+)/);
  if (totalMatch) {
    totalMissing = Number(totalMatch[1]);
    continue;
  }

  const breedMatch = line.match(/^##\s+(.+?)\s+\(([^)]+)\)\s*$/);
  if (breedMatch) {
    currentBreed = {
      name: breedMatch[1],
      breedId: breedMatch[2],
      coats: [],
    };
    breeds.push(currentBreed);
    continue;
  }

  const coatMatch = line.match(/^- \[ \]\s+(.+?)\s+-\s+`([^`]+)`\s+-\s+`([^`]+)`/);
  if (coatMatch && currentBreed) {
    currentBreed.coats.push({
      colorName: coatMatch[1],
      coatDocId: coatMatch[2],
      filename: coatMatch[3],
    });
  }
}

const generatedDate = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const output = [
  '# DoggyDex Photo To-Do List',
  '',
  `Generated ${generatedDate}`,
  '',
  'Use this as a simple shot list. Check off each coat after the matching image has been added to the app.',
  '',
  `Total photos still needed: ${totalMissing ?? breeds.reduce((sum, breed) => sum + breed.coats.length, 0)}`,
  `Breeds with photos still needed: ${breeds.length}`,
  '',
  'Tip: the text in parentheses is the exact filename to use when saving the image.',
  '',
];

for (const breed of breeds) {
  output.push(`## ${breed.name}`);
  output.push('');
  output.push(`${breed.coats.length} photo${breed.coats.length === 1 ? '' : 's'} needed`);
  output.push('');

  for (const coat of breed.coats) {
    output.push(`- [ ] ${coat.colorName} (${coat.filename})`);
  }

  output.push('');
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output.join('\n'), 'utf8');

console.log(`Wrote ${outputPath}`);
