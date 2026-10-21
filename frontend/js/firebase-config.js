/**
 * Firebase Client SDK Configuration
 * 
 * Connected to live Firebase project: campus-ride-503f5
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyDFtvmnT6g3vW1TbdSknSUFZCsU6n-vf5k",
  authDomain: "campus-ride-503f5.firebaseapp.com",
  projectId: "campus-ride-503f5",
  storageBucket: "campus-ride-503f5.firebasestorage.app",
  messagingSenderId: "225059674714",
  appId: "1:225059674714:web:a394efa683d95c1decd663",
  measurementId: "G-57SX8Q31M9"
};

export const isFirebaseConfigured = true;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  app, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  signInWithPopup,
  doc, 
  setDoc, 
  getDoc, 
  updateDoc 
};
