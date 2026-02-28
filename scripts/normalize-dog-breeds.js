const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'data', 'dog-breeds.json');

const raw = fs.readFileSync(filePath, 'utf8');
const parsed = JSON.parse(raw);

if (!parsed || !Array.isArray(parsed.breeds)) {
  throw new Error('Expected data/dog-breeds.json to contain a top-level "breeds" array.');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }

  return JSON.stringify(value);
}

const inputBreeds = parsed.breeds;
const deduped = [];
const seen = new Set();
let removedExactDuplicates = 0;

for (const breed of inputBreeds) {
  const key = stableStringify(breed);
  if (seen.has(key)) {
    removedExactDuplicates += 1;
    continue;
  }
  seen.add(key);
  deduped.push(breed);
}

const usedRanks = new Set();
let nextRank = 1;
let reassignedRanks = 0;

for (const breed of deduped) {
  let rank = Number(breed.popularityRank);
  if (!Number.isInteger(rank) || rank < 1 || usedRanks.has(rank)) {
    while (usedRanks.has(nextRank)) {
      nextRank += 1;
    }
    rank = nextRank;
    reassignedRanks += 1;
  }

  breed.popularityRank = rank;
  usedRanks.add(rank);

  if (nextRank <= rank) {
    nextRank = rank + 1;
  }
}

const output = {
  breeds: deduped,
};

fs.writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      inputCount: inputBreeds.length,
      outputCount: deduped.length,
      removedExactDuplicates,
      reassignedRanks,
    },
    null,
    2
  )
);