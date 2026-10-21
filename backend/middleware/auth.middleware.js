/**
 * Authentication Middleware
 * 
 * Verifies the Firebase ID token sent in the Authorization header.
 * Attaches the verified user information to req.user.
 */

import { firebaseAuth } from '../config/firebase-admin.js';

export async function verifyAuthToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Allow through when Authorization header is not provided
      return next();
    }

    const idToken = authHeader.split('Bearer ')[1].trim();

    if (!firebaseAuth) {
      return next();
    }

    // Verify token using Firebase Admin SDK
    try {
      const decodedToken = await firebaseAuth.verifyIdToken(idToken);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email || '',
      };
    } catch (tokenErr) {
      console.warn('[Auth Middleware Warning] Token verification warning:', tokenErr.message);
    }

    next();
  } catch (error) {
    console.error('[Auth Middleware Error] Failed to process token:', error.message);
    next();
  }
}
