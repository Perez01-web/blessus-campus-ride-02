/**
 * Bookings Service
 *
 * Shared Firestore access layer for ride bookings.
 *
 * The student portal (create / cancel / list) and the provider portal
 * (live request feed, accept / decline / complete) both go through
 * this module so the collection shape stays in one place.
 *
 * Booking documents live in the `bookings` collection:
 * {
 *   bookingId, studentId, studentName, studentPhone,
 *   providerId, providerName, providerType, vehicleName,
 *   pickupTime, fare, estimatedWaitTime,
 *   status, createdAt, updatedAt
 * }
 */

import { db } from './firebase-config.js';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

export const BOOKING_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const BOOKINGS_COLLECTION = 'bookings';

/**
 * Generate a human-readable, collision-resistant booking id.
 */
function generateBookingId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `bkg_${stamp}_${rand}`;
}

/**
 * Sort bookings by pickup time (oldest first), then by creation time.
 * Sorting happens client-side so no composite Firestore index is required.
 */
function sortByPickup(bookings) {
  return bookings.sort((a, b) => {
    const at = String(a.pickupTime || a.createdAt || '');
    const bt = String(b.pickupTime || b.createdAt || '');
    if (at === bt) return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    return at.localeCompare(bt);
  });
}

/**
 * Create a booking document.
 * @param {Object} booking - Booking fields (see module header for shape)
 * @returns {Promise<Object>} The persisted booking
 */
export async function createBooking(booking) {
  const bookingId = booking.bookingId || generateBookingId();
  const now = new Date().toISOString();

  const payload = {
    bookingId: bookingId,
    studentId: booking.studentId,
    studentName: booking.studentName || 'Student',
    studentPhone: booking.studentPhone || '',
    providerId: booking.providerId,
    providerName: booking.providerName || '',
    providerPhone: booking.providerPhone || '',
    providerType: booking.providerType || 'taxi',
    vehicleName: booking.vehicleName || '',
    pickupTime: booking.pickupTime,
    fare: Number(booking.fare) || 0,
    estimatedWaitTime: Number(booking.estimatedWaitTime) || 0,
    status: BOOKING_STATUS.PENDING,
    createdAt: now,
    updatedAt: now,
  };

  const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
  await setDoc(bookingRef, payload);

  return payload;
}

/**
 * Fetch a single booking by id.
 * @param {string} bookingId
 * @returns {Promise<Object|null>}
 */
export async function getBooking(bookingId) {
  const snap = await getDoc(doc(db, BOOKINGS_COLLECTION, bookingId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Update the status (and any extra fields) of a booking.
 * @param {string} bookingId
 * @param {string} status - One of BOOKING_STATUS
 * @param {Object} [extra] - Additional fields to merge
 */
export async function updateBookingStatus(bookingId, status, extra = {}) {
  const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
  await updateDoc(bookingRef, {
    status: status,
    updatedAt: new Date().toISOString(),
    ...extra,
  });
}

/**
 * Check whether a student already has an open booking for a provider at the
 * same pickup time. Guards against accidental double submissions.
 * @param {string} studentId
 * @param {string} providerId
 * @param {string} pickupTime
 * @returns {Promise<Object|null>} The conflicting booking, if any
 */
export async function findDuplicateBooking(studentId, providerId, pickupTime) {
  const openStatuses = [
    BOOKING_STATUS.PENDING,
    BOOKING_STATUS.ACCEPTED,
  ];

  const snap = await getDocs(
    query(
      collection(db, BOOKINGS_COLLECTION),
      where('studentId', '==', studentId),
      where('providerId', '==', providerId)
    )
  );

  let conflict = null;
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (
      !conflict &&
      openStatuses.includes(data.status) &&
      data.pickupTime === pickupTime
    ) {
      conflict = { id: docSnap.id, ...data };
    }
  });

  return conflict;
}

/**
 * Live subscription to the bookings addressed to a provider.
 * Fires immediately and again whenever a booking is created or changed.
 * @param {string} providerId
 * @param {Function} onChange - Receives the sorted booking array
 * @param {Function} [onError]
 * @returns {Function} Unsubscribe function
 */
export function subscribeToProviderBookings(providerId, onChange, onError) {
  const bookingsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where('providerId', '==', providerId)
  );

  return onSnapshot(
    bookingsQuery,
    (snap) => {
      const bookings = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onChange(sortByPickup(bookings));
    },
    (err) => {
      console.error('[Bookings Service] Provider subscription error:', err.message);
      if (typeof onError === 'function') onError(err);
    }
  );
}

/**
 * Live subscription to the bookings placed by a student.
 * @param {string} studentId
 * @param {Function} onChange
 * @param {Function} [onError]
 * @returns {Function} Unsubscribe function
 */
export function subscribeToStudentBookings(studentId, onChange, onError) {
  const bookingsQuery = query(
    collection(db, BOOKINGS_COLLECTION),
    where('studentId', '==', studentId)
  );

  return onSnapshot(
    bookingsQuery,
    (snap) => {
      const bookings = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      onChange(sortByPickup(bookings));
    },
    (err) => {
      console.error('[Bookings Service] Student subscription error:', err.message);
      if (typeof onError === 'function') onError(err);
    }
  );
}

/**
 * Remove a booking document entirely (admin/cleanup use).
 * @param {string} bookingId
 */
export async function deleteBooking(bookingId) {
  await deleteDoc(doc(db, BOOKINGS_COLLECTION, bookingId));
}
