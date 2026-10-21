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
  setDoc,
  updateDoc,
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
        if (data.available !== false) {
          if (!type || type === 'all' || data.providerType === type) {
            providers.push({
              id: docSnap.id,
              ...data
            });
          }
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
  },

  /**
   * Create a new booking document in Firestore
   * @param {Object} bookingData
   */
  async createBooking(bookingData) {
    if (!db) throw new Error('Firestore is not initialized.');
    const bookingId = bookingData.bookingId || `bk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullData = {
      ...bookingData,
      bookingId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'bookings', bookingId), fullData);
    return fullData;
  },

  /**
   * Fetch bookings for a student
   * @param {string} studentId
   */
  async getStudentBookings(studentId) {
    if (!db) throw new Error('Firestore is not initialized.');
    const q = query(collection(db, 'bookings'), where('studentId', '==', studentId));
    const snapshot = await getDocs(q);
    const bookings = [];
    snapshot.forEach(docSnap => {
      bookings.push({ id: docSnap.id, ...docSnap.data() });
    });
    return bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  /**
   * Fetch bookings for a provider
   * @param {string} providerId
   */
  async getProviderBookings(providerId) {
    if (!db) throw new Error('Firestore is not initialized.');
    const q = query(collection(db, 'bookings'), where('providerId', '==', providerId));
    const snapshot = await getDocs(q);
    const bookings = [];
    snapshot.forEach(docSnap => {
      bookings.push({ id: docSnap.id, ...docSnap.data() });
    });
    return bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  /**
   * Update booking status
   * @param {string} bookingId
   * @param {string} status
   */
  async updateBookingStatus(bookingId, status) {
    if (!db) throw new Error('Firestore is not initialized.');
    const docRef = doc(db, 'bookings', bookingId);
    await updateDoc(docRef, {
      status,
      updatedAt: new Date().toISOString(),
    });
    return { bookingId, status };
  }
};
