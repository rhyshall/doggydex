const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

const coats = [
  {
    coat_id: 34,
    coat_name: 'american_water_spaniel__chocolate',
    breed_id: 'american_water_spaniel',
    color_name: 'Chocolate',
    img_filename: 'american_water_spaniel_chocolate.jpg',
    image_exists: true,
    updated_at: new Date(),
  },
  {
    coat_id: 35,
    coat_name: 'american_water_spaniel__liver',
    breed_id: 'american_water_spaniel',
    color_name: 'Liver',
    img_filename: 'american_water_spaniel_liver.jpg',
    image_exists: true,
    updated_at: new Date(),
  },
  {
    coat_id: 36,
    coat_name: 'australian_cattle_dog__blue',
    breed_id: 'australian_cattle_dog',
    color_name: 'Blue',
    img_filename: 'australian_cattle_dog_blue.jpg',
    image_exists: true,
    updated_at: new Date(),
  },
  {
    coat_id: 37,
    coat_name: 'australian_cattle_dog__blue_mottled',
    breed_id: 'australian_cattle_dog',
    color_name: 'Blue Mottled',
    img_filename: 'australian_cattle_dog_blue_mottled.jpg',
    image_exists: true,
    updated_at: new Date(),
  },
  {
    coat_id: 38,
    coat_name: 'australian_cattle_dog__blue_speckled',
    breed_id: 'australian_cattle_dog',
    color_name: 'Blue Speckled',
    img_filename: 'australian_cattle_dog_blue_speckled.jpg',
    image_exists: true,
    updated_at: new Date(),
  },
  {
    coat_id: 39,
    coat_name: 'australian_cattle_dog__red_speckled',
    breed_id: 'australian_cattle_dog',
    color_name: 'Red Speckled',
    img_filename: 'australian_cattle_dog_red_speckled.jpg',
    image_exists: true,
    updated_at: new Date(),
  },
];

async function restoreCoats() {
  const coatsRef = db.collection('coats');
  for (const coat of coats) {
    await coatsRef.doc(coat.coat_name).set(coat);
    console.log(`Restored coat document '${coat.coat_name}' with coat_id ${coat.coat_id}`);
  }
}

restoreCoats().catch(console.error);
