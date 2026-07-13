// Generate a markdown checklist of Firestore coat docs where image_exists is false.
// Usage: node scripts/generate-missing-image-checklist.js

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const rootDir = path.resolve(__dirname, '..');
const serviceAccount = require(path.join(rootDir, 'temp', 'doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));
const outputPath = path.join(rootDir, 'reports', 'missing-coat-images.md');

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

function toBreedFallback(coatDocId) {
  return String(coatDocId || '').split('__')[0] || 'unknown';
}

function formatChecklist(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = `${row.breedName}|||${row.breedId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        breedId: row.breedId,
        breedName: row.breedName,
        rows: [],
      });
    }

    groups.get(key).rows.push(row);
  }

  const lines = [
    '# Missing Coat Images',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total missing: ${rows.length}`,
    `Breeds affected: ${groups.size}`,
    '',
  ];

  const sortedGroups = [...groups.values()].sort((a, b) => {
    return a.breedName.localeCompare(b.breedName) || a.breedId.localeCompare(b.breedId);
  });

  for (const group of sortedGroups) {
    group.rows.sort((a, b) => {
      return String(a.colorName).localeCompare(String(b.colorName))
        || String(a.coatDocId).localeCompare(String(b.coatDocId));
    });

    lines.push(`## ${group.breedName} (${group.breedId})`);
    lines.push('');

    for (const row of group.rows) {
      const color = row.colorName || 'Unknown color';
      const filename = row.imgFilename || 'missing img_filename';
      const coatId = row.coatId == null ? 'no coat_id' : `coat_id ${row.coatId}`;
      lines.push(`- [ ] ${color} - \`${row.coatDocId}\` - \`${filename}\` - ${coatId}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const [coatsSnapshot, breedsSnapshot] = await Promise.all([
    db.collection('coats').get(),
    db.collection('breeds').get(),
  ]);

  const breedNames = new Map();
  breedsSnapshot.forEach((breedDoc) => {
    const data = breedDoc.data();
    breedNames.set(breedDoc.id, data.breed_name || data.name || breedDoc.id);
  });

  const rows = [];
  coatsSnapshot.forEach((coatDoc) => {
    const data = coatDoc.data();
    if (data.image_exists !== false) {
      return;
    }

    const breedId = data.breed_id || toBreedFallback(coatDoc.id);

    rows.push({
      coatDocId: coatDoc.id,
      breedId,
      breedName: breedNames.get(breedId) || breedId,
      colorName: data.color_name || '',
      coatId: data.coat_id ?? null,
      imgFilename: data.img_filename || '',
    });
  });

  rows.sort((a, b) => {
    return a.breedName.localeCompare(b.breedName)
      || a.breedId.localeCompare(b.breedId)
      || String(a.colorName).localeCompare(String(b.colorName))
      || String(a.coatDocId).localeCompare(String(b.coatDocId));
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, formatChecklist(rows), 'utf8');

  console.log(`Wrote ${path.relative(rootDir, outputPath)}.`);
  console.log(`Total missing: ${rows.length}`);
}

main().catch((error) => {
  console.error('Error generating missing image checklist:', error);
  process.exit(1);
});
