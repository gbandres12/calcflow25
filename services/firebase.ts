import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

let app: FirebaseApp;
let firestoreDb: Firestore;

try {
  if (!getApps().length) {
    app = initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId,
    });
  } else {
    app = getApp();
  }

  if (firebaseConfig.firestoreDatabaseId) {
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    firestoreDb = getFirestore(app);
  }
} catch (error) {
  console.warn('[Firebase] Initializing fallback Firestore instance:', error);
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
}

export { app, firestoreDb };
