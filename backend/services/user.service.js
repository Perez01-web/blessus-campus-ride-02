/**
 * User Service
 * 
 * Handles all database operations related to the 'users' collection.
 */

import { firestoreDb } from '../config/firebase-admin.js';

// In-memory fallback cache to ensure the application continues functioning
// even when Firestore credentials are not configured or Cloud Firestore API is offline
const memoryUsers = new Map();

function withTimeout(promise, ms = 1200) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), ms))
  ]);
}

class UserService {
  /**
   * Create or update a user document in Firestore (with in-memory fallback)
   * @param {string} uid - Firebase Auth user ID
   * @param {Object} userData - User profile fields (name, email, phone, role, providerType)
   */
  async createUserProfile(uid, userData) {
    const existing = memoryUsers.get(uid) || {};

    const docData = {
      uid: uid,
      name: userData.name !== undefined ? userData.name : (existing.name || ''),
      email: userData.email !== undefined ? userData.email : (existing.email || ''),
      phone: userData.phone !== undefined ? userData.phone : (existing.phone || ''),
      role: userData.role || existing.role || 'student',
      createdAt: existing.createdAt || new Date().toISOString(),
    };

    if (userData.role === 'provider' && userData.providerType) {
      docData.providerType = userData.providerType;
    } else if (existing.providerType) {
      docData.providerType = existing.providerType;
    }

    // Always update memory store
    memoryUsers.set(uid, docData);

    // Attempt Firestore persistence if initialized
    if (firestoreDb) {
      try {
        const userDocRef = firestoreDb.collection('users').doc(uid);
        await withTimeout(userDocRef.set(docData, { merge: true }), 1200);
      } catch (err) {
        console.warn('[User Service] Firestore write warning (using fallback memory store):', err.message);
      }
    }

    return docData;
  }

  /**
   * Fetch a user profile by UID
   * @param {string} uid - Firebase Auth user ID
   * @returns {Object|null}
   */
  async getUserProfile(uid) {
    // 1. Try Firestore if available
    if (firestoreDb) {
      try {
        const userDocRef = firestoreDb.collection('users').doc(uid);
        const docSnapshot = await withTimeout(userDocRef.get(), 1200);
        if (docSnapshot.exists) {
          const data = docSnapshot.data();
          memoryUsers.set(uid, data);
          return data;
        }
      } catch (err) {
        console.warn('[User Service] Firestore read warning (falling back to memory cache):', err.message);
      }
    }

    // 2. Fall back to memory store
    return memoryUsers.get(uid) || null;
  }

  /**
   * Fetch a user profile by email
   * @param {string} email
   * @returns {Object|null}
   */
  async getUserByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();

    // 1. Check memory store
    for (const [, user] of memoryUsers.entries()) {
      if (user.email && user.email.toLowerCase().trim() === cleanEmail) {
        return user;
      }
    }

    // 2. Query Firestore if available
    if (firestoreDb) {
      try {
        const querySnap = await withTimeout(firestoreDb.collection('users')
          .where('email', '==', cleanEmail)
          .limit(1)
          .get(), 1200);
        if (!querySnap.empty) {
          const doc = querySnap.docs[0];
          const data = doc.data();
          memoryUsers.set(data.uid || doc.id, data);
          return data;
        }
      } catch (err) {
        console.warn('[User Service] Firestore query by email warning:', err.message);
      }
    }

    return null;
  }
}

export default new UserService();
