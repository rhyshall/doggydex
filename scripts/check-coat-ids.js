// Script to check for unique and sequential coat_id values in all coats
// Usage: node scripts/check-coat-ids.js

const fs = require('fs');
const path = require('path');

const breedsPath = path.join(__dirname, '../data/dog-breeds.json');
const breedsData = JSON.parse(fs.readFileSync(breedsPath, 'utf8'));

// Collect all coat_id values
const coatIds = [];

for (const breed of breedsData) {
  if (Array.isArray(breed.coats)) {
    for (const coat of breed.coats) {
      if (typeof coat.coat_id === 'number') {
        coatIds.push(coat.coat_id);
      }
    }
  }
}

// Check for duplicates
const duplicates = coatIds.filter((id, idx, arr) => arr.indexOf(id) !== idx);
const uniqueCoatIds = Array.from(new Set(coatIds));
uniqueCoatIds.sort((a, b) => a - b);

// Check for missing values in sequence
const minId = uniqueCoatIds[0];
const maxId = uniqueCoatIds[uniqueCoatIds.length - 1];
const missing = [];
for (let i = minId; i <= maxId; i++) {
  if (!uniqueCoatIds.includes(i)) {
    missing.push(i);
  }
}

console.log(`Total coat_id values: ${coatIds.length}`);
console.log(`Unique coat_id values: ${uniqueCoatIds.length}`);

if (duplicates.length > 0) {
  console.log('Duplicate coat_id values found:', Array.from(new Set(duplicates)));
} else {
  console.log('No duplicate coat_id values found.');
}

if (missing.length > 0) {
  console.log('Missing coat_id values in sequence:', missing);
} else {
  console.log('No missing coat_id values in sequence.');
}
