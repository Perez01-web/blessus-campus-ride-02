/**
 * Client-Side Firestore Service
 * 
 * Interacts directly with Firestore database collections.
 */

import { db, auth } from './firebase-config.js';
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  where 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

export const firestoreService = {
  /**
   * Query available providers directly from Firestore
   * @param {string} [type] - 'all' | 'taxi' | 'motorbike'
   */
  async getAvailableProviders(type = 'all') {
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    try {
      const providersRef = collection(db, 'providers');
      let q = query(providersRef);
      
      const snapshot = await getDocs(q);
      const providers = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.available === false) {
          // A provider who set a "back at" time stays visible so students can
          // see when they are back. A plain toggle-off has no return time, so
          // that provider is hidden from search entirely.
          const untilMs = data.availableUntil ? new Date(data.availableUntil).getTime() : NaN;
          if (Number.isNaN(untilMs)) {
            return;
          }
        }
        if (!type || type === 'all' || data.providerType === type) {
          providers.push({
            id: docSnap.id,
            ...data
          });
        }
      });

      return providers;
    } catch (err) {
      console.warn('[Firestore Service] Direct query warning:', err.message);
      throw err;
    }
  },

  /**
   * Get single provider details
   * @param {string} providerId
   */
  async getProvider(providerId) {
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    const docRef = doc(db, 'providers', providerId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return null;
    }
    return { id: snap.id, ...snap.data() };
  }
};
