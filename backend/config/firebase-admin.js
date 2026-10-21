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
let hasServiceAccount = false;

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
      hasServiceAccount = true;
      console.log('[Firebase Admin] Initialized with Service Account environment variables.');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdminApp = initializeApp({
        credential: applicationDefault(),
      });
      hasServiceAccount = true;
      console.log('[Firebase Admin] Initialized with application default credentials.');
    } else {
      firebaseAdminApp = initializeApp({
        projectId: targetProjectId,
      });
      console.log(`[Firebase Admin] Initialized for project: ${targetProjectId}`);
    }
  } else {
    firebaseAdminApp = getApps()[0];
    hasServiceAccount = true;
  }

  // Only hand out a Firestore handle when real credentials are available.
  // Without them the Admin SDK cannot obtain an access token, and the
  // resulting rejection is fatal to the Node process. Services fall back
  // to their in-memory store when firestoreDb is null.
  if (hasServiceAccount) {
    firestoreDb = targetDatabaseId
      ? getFirestore(firebaseAdminApp, targetDatabaseId)
      : getFirestore(firebaseAdminApp);
    console.log(`[Firebase Admin] Firestore ready (DB: ${targetDatabaseId || 'default'}).`);
  } else {
    console.warn('[Firebase Admin] No service account credentials found - running in LOCAL FALLBACK MODE.');
    console.warn('[Firebase Admin] Backend Firestore is disabled; services will use their in-memory store.');
  }

  firebaseAuth = getAuth(firebaseAdminApp);
  console.log('[Firebase Admin] Auth service ready.');
} catch (error) {
  console.error('[Firebase Admin Error] Failed to initialize Firebase Admin SDK:', error.message);
}

export { firebaseAdminApp, firestoreDb, firebaseAuth };
