import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import fallbackConfig from '../firebase-applet-config.json';

const env = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || fallbackConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || fallbackConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || fallbackConfig.appId,
};

const namedDatabaseId = String(
  env.VITE_FIRESTORE_DATABASE_ID || fallbackConfig.firestoreDatabaseId || ''
).trim();

let app: FirebaseApp;
let firestoreDb: Firestore;
let firebaseFunctions: Functions;

try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  // Sem ID nomeado = banco (default). Evita misturar com o DB da AI Studio.
  firestoreDb = namedDatabaseId
    ? getFirestore(app, namedDatabaseId)
    : getFirestore(app);

  try {
    firebaseFunctions = getFunctions(app, 'southamerica-east1');
  } catch {
    firebaseFunctions = getFunctions(app);
  }

  console.info(
    `[Firebase] projeto=${firebaseConfig.projectId} db=${namedDatabaseId || '(default)'}`
  );
} catch (error) {
  console.error('[Firebase] Falha ao inicializar. Conferir credenciais do projeto novo.', error);
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
  firebaseFunctions = getFunctions(app);
}

export { app, firestoreDb, firebaseFunctions };
