# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Firebase services

Firebase is initialized in `lib/firebase.js`.

Use ready-made service instances from `lib/firebase-services.js`:

```js
import { auth, db, storage } from '@/lib/firebase-services';
```

## Firebase auth setup

DoggyDex uses Firebase Authentication for:

- Google sign-in
- Email/password sign-in

Set these env values in `.env`:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

For Google sign-in on Expo/native flows, also set:

- `EXPO_CLIENT_ID`
- `IOS_CLIENT_ID`
- `ANDROID_CLIENT_ID`
- `WEB_CLIENT_ID`

Quiz progress sync is tracked in Firestore by Firebase Auth `uid`.

## Firestore rules and indexes

This repo includes:

- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`

### Deploy

```bash
npm install -g firebase-tools
firebase login
firebase use <your-firebase-project-id>
firebase deploy --only firestore:rules,firestore:indexes
```

### Security model

- `users/{uid}` and `userProgress/{uid}` are user-private (owner-only read/write).
- `user_coats` and `user_breed_badges` are user-private by `user_id == request.auth.uid`.
- `breeds`, `coats`, and `_meta` are read-only from clients.

User profile upserts now use `_meta/user_id_counter` in a transaction to assign ascending numeric
`users.id` values and set `users.date_created`.
If you pull these changes, deploy updated Firestore rules before testing registration flows.

### Catalog seeding note

Breed/coat catalog writes are blocked by the locked client rules above.
Seed catalog documents with Admin SDK / server-side tooling (or temporarily relax rules during controlled seeding, then re-deploy locked rules).

### Seed breeds/coats with Admin SDK

1. Generate a Firebase service account key (Firebase Console → Project settings → Service accounts).
2. Set one of these env vars:

```bash
FIREBASE_SERVICE_ACCOUNT_KEY=./service-account.json
```

or

```bash
FIREBASE_SERVICE_ACCOUNT_JSON={...full-json...}
```

3. Run:

```bash
npm run seed:breeds
```

Preview write counts only (no credentials required, no writes):

```bash
npm run seed:breeds:dry-run
```

This upserts:

- `breeds`
- `coats`
- `_meta/breed_catalog`

If `coats.coat_id` has already been migrated to numeric values, rerunning `seed:breeds`
preserves existing numeric IDs for matching coat docs and only assigns new numbers to new coats.

The seeder now prefers each breed's `coats` array (`coat_id`, `coat_name`, `color_name`) when present,
and falls back to `coatColors` for backward compatibility.

### Sync local images to Firebase Storage

Use this Admin SDK script to sync files from local `img/` to your Firebase Storage bucket.

Run a preview first:

```bash
npm run sync:images:dry-run
```

Run the real sync:

```bash
npm run sync:images
```

Optional flags:

- `--dir=img` to choose a different local source folder.
- `--prefix=img` to choose a different Storage path prefix.
- `--bucket=<bucket-name>` to force a specific Storage bucket.
- `--delete-remote` to remove remote files under the prefix that do not exist locally.

Examples:

```bash
node ./scripts/sync-images-to-storage.js --dry-run --prefix=img
node ./scripts/sync-images-to-storage.js --dry-run --bucket=your-project.appspot.com
node ./scripts/sync-images-to-storage.js --delete-remote
```

The script reads credentials from `FIREBASE_SERVICE_ACCOUNT_KEY` or
`FIREBASE_SERVICE_ACCOUNT_JSON` (same as the seeding scripts), and uses
`FIREBASE_STORAGE_BUCKET` or `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` for bucket selection.
