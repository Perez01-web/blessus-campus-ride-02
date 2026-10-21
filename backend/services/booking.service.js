/**
 * Booking Service
 * 
 * Manages ride reservations, trip requests, status transitions,
 * and history between students and drivers.
 */

import { firestoreDb } from '../config/firebase-admin.js';

// In-memory store for instant responsiveness & offline resilience
const memoryBookings = new Map();

// Helper timeout
function withTimeout(promise, ms = 1200) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), ms))
  ]);
}

class BookingService {
  /**
   * Create a new ride booking
   * @param {Object} data
   */
  async createBooking(data) {
    const bookingId = data.bookingId || `bk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const newBooking = {
      bookingId,
      studentId: data.studentId,
      studentName: data.studentName || 'Campus Student',
      studentPhone: data.studentPhone || '',
      providerId: data.providerId,
      providerName: data.providerName || 'Campus Driver',
      providerType: data.providerType || 'taxi',
      providerPhone: data.providerPhone || '',
      vehicleName: data.vehicleName || 'Standard Vehicle',
      vehicleRegistration: data.vehicleRegistration || '',
      pickupLocation: data.pickupLocation || 'Main Campus Gate',
      destination: data.destination || 'Town Center',
      fare: Number(data.fare) || 0,
      paymentMethod: data.paymentMethod || 'cash',
      notes: data.notes || '',
      status: 'pending', // pending | accepted | in_progress | completed | cancelled
      createdAt: now,
      updatedAt: now,
    };

    memoryBookings.set(bookingId, newBooking);

    if (firestoreDb) {
      try {
        const docRef = firestoreDb.collection('bookings').doc(bookingId);
        await withTimeout(docRef.set(newBooking));
      } catch (err) {
        console.warn('[Booking Service] Firestore write warning (cached in memory):', err.message);
      }
    }

    return newBooking;
  }

  /**
   * Get all bookings for a student
   * @param {string} studentId
   */
  async getStudentBookings(studentId) {
    const results = [];

    // 1. Try Firestore
    if (firestoreDb) {
      try {
        const q = firestoreDb.collection('bookings')
          .where('studentId', '==', studentId);
        const snap = await withTimeout(q.get());
        snap.forEach(d => {
          const item = d.data();
          memoryBookings.set(item.bookingId || d.id, item);
          results.push(item);
        });
        if (results.length > 0) {
          return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
      } catch (err) {
        console.warn('[Booking Service] Firestore query warning for student:', err.message);
      }
    }

    // 2. Fall back to memory
    for (const [, b] of memoryBookings.entries()) {
      if (b.studentId === studentId) {
        results.push(b);
      }
    }

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get all bookings for a provider
   * @param {string} providerId
   */
  async getProviderBookings(providerId) {
    const results = [];

    // 1. Try Firestore
    if (firestoreDb) {
      try {
        const q = firestoreDb.collection('bookings')
          .where('providerId', '==', providerId);
        const snap = await withTimeout(q.get());
        snap.forEach(d => {
          const item = d.data();
          memoryBookings.set(item.bookingId || d.id, item);
          results.push(item);
        });
        if (results.length > 0) {
          return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
      } catch (err) {
        console.warn('[Booking Service] Firestore query warning for provider:', err.message);
      }
    }

    // 2. Fall back to memory
    for (const [, b] of memoryBookings.entries()) {
      if (b.providerId === providerId) {
        results.push(b);
      }
    }

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get booking details
   * @param {string} bookingId
   */
  async getBooking(bookingId) {
    if (memoryBookings.has(bookingId)) {
      return memoryBookings.get(bookingId);
    }

    if (firestoreDb) {
      try {
        const snap = await withTimeout(firestoreDb.collection('bookings').doc(bookingId).get());
        if (snap.exists) {
          const data = snap.data();
          memoryBookings.set(bookingId, data);
          return data;
        }
      } catch (e) {
        console.warn('[Booking Service] getBooking warning:', e.message);
      }
    }

    return null;
  }

  /**
   * Update booking status (e.g. accepted, in_progress, completed, cancelled)
   * @param {string} bookingId
   * @param {string} newStatus
   * @param {Object} [meta]
   */
  async updateStatus(bookingId, newStatus, meta = {}) {
    const existing = await this.getBooking(bookingId);
    if (!existing) {
      throw new Error(`Booking ${bookingId} not found`);
    }

    const updated = {
      ...existing,
      status: newStatus,
      updatedAt: new Date().toISOString(),
      ...meta,
    };

    memoryBookings.set(bookingId, updated);

    if (firestoreDb) {
      try {
        await withTimeout(firestoreDb.collection('bookings').doc(bookingId).set(updated, { merge: true }));
      } catch (err) {
        console.warn('[Booking Service] Firestore status update warning:', err.message);
      }
    }

    return updated;
  }
}

export default new BookingService();
