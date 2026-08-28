import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';

/**
 * 🔒 Credenciais Oficiais do Projeto Firebase: saas-calcflow
 */
export const firebaseConfig = {
  apiKey: "AIzaSyC0fuajdfJZl1CWuAlpYq4z3WjjUgI3A9c",
  authDomain: "saas-calcflow.firebaseapp.com",
  projectId: "saas-calcflow",
  storageBucket: "saas-calcflow.firebasestorage.app",
  messagingSenderId: "468483844680",
  appId: "1:468483844680:web:75188335801bf8478cc67d",
  measurementId: "G-X6Y86B6QMH"
};

// 1. Inicialização do Firebase App (Firebase v12 modular)
export const app: FirebaseApp = getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApp();

// 2. Firebase Authentication
let authInstance: Auth;
try {
  authInstance = getAuth(app);
} catch (error) {
  console.warn('[Firebase] Auth initialization warning:', error);
  authInstance = getAuth(app);
}
export const auth: Auth = authInstance;

// 3. Cloud Firestore (db)
export const db: Firestore = getFirestore(app);
export const firestoreDb: Firestore = db;

// 4. Cloud Functions
let functionsInstance: Functions;
try {
  functionsInstance = getFunctions(app, 'southamerica-east1');
} catch {
  functionsInstance = getFunctions(app);
}
export const functions: Functions = functionsInstance;
export const firebaseFunctions: Functions = functionsInstance;

export default app;
