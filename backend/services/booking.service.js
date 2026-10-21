/**
 * Booking Service
 *
 * Handles all database operations related to the 'bookings' collection.
 */

import { firestoreDb } from '../config/firebase-admin.js';

// In-memory fallback cache to ensure booking requests function
// even when Firestore credentials are not configured or offline
const memoryBookings = new Map();

const VALID_STATUSES = ['pending', 'accepted', 'rejected', 'completed', 'cancelled'];

class BookingService {
  /**
   * Create a booking document in Firestore (with in-memory fallback)
   * @param {Object} bookingData - Booking fields
   * @returns {Object} The persisted booking
   */
  async createBooking(bookingData) {
    const bookingId =
      bookingData.bookingId ||
      `bkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const existing = memoryBookings.get(bookingId) || {};
    const now = new Date().toISOString();

    const booking = {
      bookingId: bookingId,
      studentId: bookingData.studentId || '',
      studentName: bookingData.studentName || 'Student',
      studentPhone: bookingData.studentPhone || '',
      providerId: bookingData.providerId || '',
      providerName: bookingData.providerName || '',
      providerPhone: bookingData.providerPhone || '',
      providerType: bookingData.providerType || 'taxi',
      vehicleName: bookingData.vehicleName || '',
      pickupTime: bookingData.pickupTime || now,
      fare: Number(bookingData.fare) || 0,
      estimatedWaitTime: Number(bookingData.estimatedWaitTime) || 0,
      status: existing.status || 'pending',
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };

    memoryBookings.set(bookingId, booking);

    if (firestoreDb) {
      try {
        const bookingDocRef = firestoreDb.collection('bookings').doc(bookingId);
        await bookingDocRef.set(booking, { merge: true });
      } catch (err) {
        console.warn('[Booking Service] Firestore write warning (using fallback memory store):', err.message);
      }
    }

    return booking;
  }

  /**
   * Get a single booking by id
   * @param {string} bookingId
   * @returns {Object|null}
   */
  async getBooking(bookingId) {
    if (firestoreDb) {
      try {
        const bookingDocRef = firestoreDb.collection('bookings').doc(bookingId);
        const docSnapshot = await bookingDocRef.get();
        if (docSnapshot.exists) {
          const data = docSnapshot.data();
          memoryBookings.set(bookingId, data);
          return data;
        }
      } catch (err) {
        console.warn('[Booking Service] Firestore read warning (falling back to memory cache):', err.message);
      }
    }

    return memoryBookings.get(bookingId) || null;
  }

  /**
   * Update the status of a booking
   * @param {string} bookingId
   * @param {string} status - pending | accepted | rejected | completed | cancelled
   * @returns {Object|null}
   */
  async updateBookingStatus(bookingId, status) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid booking status "${status}".`);
    }

    const existing = await this.getBooking(bookingId);
    if (!existing) return null;

    const updated = {
      ...existing,
      status: status,
      updatedAt: new Date().toISOString(),
    };

    memoryBookings.set(bookingId, updated);

    if (firestoreDb) {
      try {
        const bookingDocRef = firestoreDb.collection('bookings').doc(bookingId);
        await bookingDocRef.set(updated, { merge: true });
      } catch (err) {
        console.warn('[Booking Service] Firestore update warning (saved to memory store):', err.message);
      }
    }

    return updated;
  }

  /**
   * Get all bookings addressed to a provider, ordered by pickup time
   * @param {string} providerId
   * @returns {Array<Object>}
   */
  async getBookingsByProvider(providerId) {
    const results = [];

    if (firestoreDb) {
      try {
        const snapshot = await firestoreDb.collection('bookings')
          .where('providerId', '==', providerId)
          .get();

        snapshot.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() });
        });
      } catch (err) {
        console.warn('[Booking Service] Firestore provider query warning:', err.message);
      }
    }

    if (results.length === 0) {
      for (const [id, booking] of memoryBookings.entries()) {
        if (booking.providerId === providerId) {
          results.push({ id: id, ...booking });
        }
      }
    }

    return this.sortByPickup(results);
  }

  /**
   * Get all bookings placed by a student, ordered by pickup time
   * @param {string} studentId
   * @returns {Array<Object>}
   */
  async getBookingsByStudent(studentId) {
    const results = [];

    if (firestoreDb) {
      try {
        const snapshot = await firestoreDb.collection('bookings')
          .where('studentId', '==', studentId)
          .get();

        snapshot.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() });
        });
      } catch (err) {
        console.warn('[Booking Service] Firestore student query warning:', err.message);
      }
    }

    if (results.length === 0) {
      for (const [id, booking] of memoryBookings.entries()) {
        if (booking.studentId === studentId) {
          results.push({ id: id, ...booking });
        }
      }
    }

    return this.sortByPickup(results);
  }

  /**
   * Sort bookings by pickup time (oldest first)
   * @param {Array<Object>} bookings
   * @returns {Array<Object>}
   */
  sortByPickup(bookings) {
    return bookings.sort((a, b) => {
      const at = String(a.pickupTime || a.createdAt || '');
      const bt = String(b.pickupTime || b.createdAt || '');
      if (at === bt) return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      return at.localeCompare(bt);
    });
  }
}

export default new BookingService();
