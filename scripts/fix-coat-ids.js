// Script to check and fix unique/sequential coat_id values in all coats
// Usage: node scripts/fix-coat-ids.js

const fs = require('fs');
const path = require('path');

const breedsPath = path.join(__dirname, '../data/dog-breeds.json');
const breedsData = JSON.parse(fs.readFileSync(breedsPath, 'utf8'));

const breeds = breedsData.breeds || breedsData;

// Collect all coat_id values and references
const coatIdRefs = [];

for (const breed of breeds) {
  if (Array.isArray(breed.coats)) {
    for (const coat of breed.coats) {
      if (coat && typeof coat === 'object' && typeof coat.coat_id === 'number') {
        coatIdRefs.push({
          ref: coat,
          value: coat.coat_id,
        });
      }
    }
  }
}

// Find duplicates and missing
const allIds = coatIdRefs.map(x => x.value);
const uniqueIds = Array.from(new Set(allIds)).sort((a, b) => a - b);
const minId = uniqueIds[0];
const maxId = uniqueIds[uniqueIds.length - 1];
const missing = [];
for (let i = minId; i <= maxId; i++) {
  if (!uniqueIds.includes(i)) missing.push(i);
}
const duplicates = allIds.filter((id, idx, arr) => arr.indexOf(id) !== idx);
const duplicateIds = Array.from(new Set(duplicates));

// Fix duplicates by assigning missing IDs
let missingIdx = 0;
let changes = 0;
const seen = new Set();
for (const entry of coatIdRefs) {
  if (seen.has(entry.value)) {
    // Duplicate, assign a missing value if available
    if (missingIdx < missing.length) {
      entry.ref.coat_id = missing[missingIdx++];
      changes++;
    } else {
      // If no missing, assign next available max+1
      entry.ref.coat_id = ++maxId;
      changes++;
    }
  }
  seen.add(entry.ref.coat_id);
}

if (changes > 0) {
  // Write back to file
  fs.writeFileSync(breedsPath, JSON.stringify(breedsData, null, 2));
  console.log(`Fixed ${changes} duplicate coat_id values. Updated file.`);
} else {
  console.log('No duplicate coat_id values found.');
}

if (missing.length > 0 && missingIdx < missing.length) {
  console.log('Some missing coat_id values could not be filled (not enough duplicates).');
} else if (missing.length === 0) {
  console.log('No missing coat_id values in sequence.');
} else {
  console.log('All missing coat_id values filled.');
}

console.log('Done.');
