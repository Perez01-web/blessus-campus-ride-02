/**
 * Firebase Admin SDK Configuration
 * 
 * Initializes the Firebase Admin SDK using environment variables,
 * application credentials, or the provisioned project config.
 */

import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appletConfigPath = path.resolve(__dirname, '../../firebase-applet-config.json');

let appletConfig = null;
try {
  if (fs.existsSync(appletConfigPath)) {
    appletConfig = JSON.parse(fs.readFileSync(appletConfigPath, 'utf8'));
  }
} catch (e) {
  // ignore
}

const targetProjectId = process.env.FIREBASE_PROJECT_ID || appletConfig?.projectId || 'campus-ride-503f5';
const targetDatabaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig?.firestoreDatabaseId;

let firebaseAdminApp = null;
let firestoreDb = null;
let firebaseAuth = null;

try {
  if (getApps().length === 0) {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

      firebaseAdminApp = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      console.log('[Firebase Admin] Initialized with Service Account environment variables.');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdminApp = initializeApp({
        credential: applicationDefault(),
      });
      console.log('[Firebase Admin] Initialized with application default credentials.');
    } else {
      firebaseAdminApp = initializeApp({
        projectId: targetProjectId,
      });
      console.log(`[Firebase Admin] Initialized for project: ${targetProjectId}`);
    }
  } else {
    firebaseAdminApp = getApps()[0];
  }

  firestoreDb = targetDatabaseId 
    ? getFirestore(firebaseAdminApp, targetDatabaseId) 
    : getFirestore(firebaseAdminApp);
  firebaseAuth = getAuth(firebaseAdminApp);
  console.log(`[Firebase Admin] Firestore and Auth services ready (DB: ${targetDatabaseId || 'default'}).`);
} catch (error) {
  console.error('[Firebase Admin Error] Failed to initialize Firebase Admin SDK:', error.message);
}

export { firebaseAdminApp, firestoreDb, firebaseAuth };
