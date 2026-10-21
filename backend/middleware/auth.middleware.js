/**
 * Authentication Middleware
 *
 * Verifies the Firebase ID token sent in the Authorization header.
 * Attaches the verified user information to req.user.
 *
 * Requests without a valid token are rejected with 401. If the Admin SDK
 * has no credentials configured the server cannot verify tokens at all,
 * so protected routes answer with 503 instead of silently allowing the
 * request through.
 */

import { firebaseAuth } from '../config/firebase-admin.js';

export async function verifyAuthToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Provide a valid Firebase ID token.',
    });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();

  if (!idToken) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Provide a valid Firebase ID token.',
    });
  }

  if (!firebaseAuth) {
    // The Admin SDK is not configured, so the token cannot be verified.
    return res.status(503).json({
      success: false,
      message:
        'Backend authentication is not configured. Add Firebase service account credentials to the server environment.',
    });
  }

  try {
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      role: decodedToken.role || null,
    };
  } catch (tokenErr) {
    console.warn('[Auth Middleware] Rejected token:', tokenErr.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }

  return next();
}
