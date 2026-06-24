// Script to add Blue Picardy Spaniel to Firestore breeds and coats collections
// Usage: node scripts/add-blue-picardy-spaniel.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));
const breedData = {
  breed: "Blue Picardy Spaniel",
  coatColors: ["Blue", "Blue & Black", "Gray (Blue Roan)"],
  size: "Medium/Large",
  weightRange: "45-60 lbs",
  heightRange: "22-24 inches",
  energyLevel: "High",
  temperament: ["Gentle", "Loyal", "Intelligent", "Calm"],
  trainability: 4,
  funFact: "Blue Picardy Spaniels are known for their unique blue-gray roan coat and excellent hunting abilities in wet terrain.",
  historicalPurpose: "Hunting and retrieving game birds",
  originCountry: "France",
  popularityRank: 120,
  categoryTags: ["Sporting"],
  thumbnail: "blue_picardy_spaniel_thumb.jpg",
  coatCount: 3,
  coats: [
    { coat_id: 600, coat_name: "blue_picardy_spaniel__blue", color_name: "Blue" },
    { coat_id: 601, coat_name: "blue_picardy_spaniel__blue_black", color_name: "Blue & Black" },
    { coat_id: 602, coat_name: "blue_picardy_spaniel__gray", color_name: "Gray (Blue Roan)" }
  ]
};

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function addBreedAndCoats() {
  // Add to breeds collection
  const breedId = "blue_picardy_spaniel";
  const breedDoc = {
    breed_id: breedId,
    breed_name: breedData.breed,
    category_tags: breedData.categoryTags,
    coat_count: breedData.coatCount,
    coat_colors: breedData.coatColors,
    energy_level: breedData.energyLevel,
    fun_fact: breedData.funFact,
    height_range: breedData.heightRange,
    historical_purpose: breedData.historicalPurpose,
    origin_country: breedData.originCountry,
    popularity_rank: breedData.popularityRank,
    size: breedData.size,
    temperament: breedData.temperament,
    thumbnail: breedData.thumbnail,
    trainability: breedData.trainability,
    weight_range: breedData.weightRange,
    updated_at: FieldValue.serverTimestamp(),
  };
  await db.collection('breeds').doc(breedId).set(breedDoc);
  console.log('Added breed:', breedId);

  // Add to coats collection
  for (const coat of breedData.coats) {
    const coatDoc = {
      ...coat,
      breed_id: breedId,
      updated_at: FieldValue.serverTimestamp(),
    };
    await db.collection('coats').doc(coat.coat_name).set(coatDoc);
    console.log('Added coat:', coat.coat_name);
  }
}

addBreedAndCoats().catch(err => {
  console.error('Error adding breed or coats:', err);
  process.exit(1);
});
