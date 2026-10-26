import { initializeApp } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import { getAuth } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import { getFirestore } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { getFunctions } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

// Replace these values with your real Firebase Web App configuration.
const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  appId: "REPLACE_WITH_FIREBASE_APP_ID"
};

export const firebaseReady =
  !firebaseConfig.apiKey.startsWith("REPLACE_") &&
  !firebaseConfig.projectId.startsWith("REPLACE_") &&
  !firebaseConfig.appId.startsWith("REPLACE_");

let auth = null;
let db = null;
let functions = null;

if (firebaseReady) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, "us-central1");
}

export { auth, db, functions };
