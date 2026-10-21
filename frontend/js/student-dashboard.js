/**
 * Student Dashboard Controller
 *
 * Manages the student dashboard view, auth guards, profile display,
 * the live "My Bookings" list, and logout.
 */

import { requireAuth, logoutUser } from './auth.js';
import { showComingSoonModal, closeComingSoonModal, formatMWK } from './utils.js';
import {
  subscribeToStudentBookings,
  updateBookingStatus,
  BOOKING_STATUS,
} from './bookings-service.js';

let studentUid = null;
let bookingsUnsubscribe = null;
let studentBookings = [];

document.addEventListener('DOMContentLoaded', () => {
  // Protect page: require 'student' role
  requireAuth('student', (user) => {
    studentUid = user.uid;

    // Populate user profile info
    const studentNameEl = document.getElementById('studentName');
    const studentEmailEl = document.getElementById('studentEmail');
    const studentPhoneEl = document.getElementById('studentPhone');

    if (studentNameEl) studentNameEl.textContent = user.name || 'Student';
    if (studentEmailEl) studentEmailEl.textContent = user.email || '';
    if (studentPhoneEl) studentPhoneEl.textContent = user.phone || 'Not provided';

    // Keep the booking list live so status changes show up immediately
    startBookingsSubscription();
  });

  // Action buttons
  const findTransportBtn = document.getElementById('findTransportBtn');
  if (findTransportBtn) {
    findTransportBtn.addEventListener('click', () => {
      window.location.href = './find-transport.html';
    });
  }

  const myBookingsBtn = document.getElementById('myBookingsBtn');
  if (myBookingsBtn) {
    myBookingsBtn.addEventListener('click', openMyBookingsModal);
  }

  // Modal close handlers
  const closeModalBtn = document.getElementById('closeModalBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeComingSoonModal);
  }

  const modalOverlay = document.getElementById('comingSoonModal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeComingSoonModal();
    });
  }

  // My Bookings modal controls
  const closeMyBookingsBtn = document.getElementById('closeMyBookingsBtn');
  if (closeMyBookingsBtn) {
    closeMyBookingsBtn.addEventListener('click', closeMyBookingsModal);
  }

  const myBookingsModal = document.getElementById('myBookingsModal');
  if (myBookingsModal) {
    myBookingsModal.addEventListener('click', (e) => {
      if (e.target === myBookingsModal) closeMyBookingsModal();
    });
  }

  // Cancel booking action (delegated - the list re-renders on live updates)
  const myBookingsList = document.getElementById('myBookingsList');
  if (myBookingsList) {
    myBookingsList.addEventListener('click', (e) => {
      const cancelBtn = e.target.closest('[data-booking-action="cancel"]');
      if (!cancelBtn) return;

      const bookingId = cancelBtn.dataset.bookingId;
      if (!bookingId) return;

      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';

      handleCancelBooking(bookingId);
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
  }
});

/**
 * Subscribe to this student's bookings and keep the list in sync.
 */
function startBookingsSubscription() {
  if (!studentUid) return;

  bookingsUnsubscribe = subscribeToStudentBookings(
    studentUid,
    (bookings) => {
      studentBookings = bookings;
      renderMyBookings(bookings);
    },
    (err) => {
      console.error('[Student Dashboard] Booking feed error:', err.message);
      const errorBox = document.getElementById('myBookingsError');
      if (errorBox) {
        errorBox.className = 'alert alert-danger';
        errorBox.textContent =
          'Your bookings could not be loaded. Please refresh the page or check your Firestore security rules.';
      }
    }
  );
}

/**
 * Open the My Bookings modal.
 */
function openMyBookingsModal() {
  const modal = document.getElementById('myBookingsModal');
  if (modal) modal.classList.add('active');

  // Render whatever we already have, then let the live listener refresh it
  renderMyBookings(studentBookings);
}

/**
 * Close the My Bookings modal.
 */
function closeMyBookingsModal() {
  const modal = document.getElementById('myBookingsModal');
  if (modal) modal.classList.remove('active');
}

/**
 * Render the student's bookings inside the modal.
 * @param {Array<Object>} bookings
 */
function renderMyBookings(bookings) {
  const listEl = document.getElementById('myBookingsList');
  const emptyEl = document.getElementById('myBookingsEmpty');
  const errorEl = document.getElementById('myBookingsError');

  if (!listEl) return;

  if (errorEl) {
    errorEl.className = 'alert alert-danger hidden';
    errorEl.textContent = '';
  }

  if (!bookings || bookings.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  listEl.innerHTML = bookings.map(createMyBookingItemHtml).join('');
}

/**
 * Build the HTML for a single booking row.
 */
function createMyBookingItemHtml(booking) {
  const status = booking.status || BOOKING_STATUS.PENDING;
  const statusLabel = {
    [BOOKING_STATUS.PENDING]: 'Pending',
    [BOOKING_STATUS.ACCEPTED]: 'Accepted',
    [BOOKING_STATUS.REJECTED]: 'Declined',
    [BOOKING_STATUS.COMPLETED]: 'Completed',
    [BOOKING_STATUS.CANCELLED]: 'Cancelled',
  }[status] || status;

  const bookingId = escapeHtml(booking.id || booking.bookingId || '');
  const fare = Number(booking.fare) || 0;
  const pickupLabel = formatPickupTime(booking.pickupTime);
  const isPast = booking.pickupTime && new Date(booking.pickupTime).getTime() < Date.now();
  const telHref = String(booking.providerPhone || '').replace(/[^\d+]/g, '');

  const canCancel =
    status === BOOKING_STATUS.PENDING || status === BOOKING_STATUS.ACCEPTED;

  let actions = '';
  if (canCancel) {
    actions = `
      <button type="button" class="btn btn-outline-danger" data-booking-action="cancel" data-booking-id="${bookingId}">
        Cancel Booking
      </button>
      ${telHref.length >= 6 ? `<a class="btn btn-secondary" href="tel:${escapeHtml(telHref)}">Call Driver</a>` : ''}
    `;
  } else if (status === BOOKING_STATUS.ACCEPTED) {
    actions = `<span class="booking-item-empty-note">Your driver confirmed this ride.</span>`;
  } else {
    actions = `<span class="booking-item-empty-note">This booking is closed.</span>`;
  }

  return `
    <div class="booking-item is-${escapeHtml(status)}" data-booking-id="${bookingId}">
      <div class="booking-item-top">
        <h3 class="booking-student-name">${escapeHtml(booking.providerName || 'Driver')}</h3>
        <span class="booking-status status-${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
      </div>

      <ul class="booking-details-list">
        <li class="booking-detail-item">
          <span>🕒</span>
          <strong>Pickup:</strong> ${escapeHtml(pickupLabel)}
          ${isPast && status !== BOOKING_STATUS.COMPLETED ? '<span class="booking-status status-cancelled">Time passed</span>' : ''}
        </li>
        <li class="booking-detail-item">
          <span>🚕</span>
          <strong>Service:</strong> ${escapeHtml(booking.providerType === 'motorbike' ? 'Motorbike Driver' : 'Taxi Driver')}
          ${booking.vehicleName ? ` — ${escapeHtml(booking.vehicleName)}` : ''}
        </li>
        <li class="booking-detail-item">
          <span>💰</span>
          <strong>Fare:</strong> ${escapeHtml(fare ? formatMWK(fare) : 'Fare on request')}
        </li>
      </ul>

      <div class="booking-item-actions">
        ${actions}
      </div>
    </div>
  `;
}

/**
 * Cancel a booking the student made.
 */
async function handleCancelBooking(bookingId) {
  try {
    await updateBookingStatus(bookingId, BOOKING_STATUS.CANCELLED);
    console.log(`[Student Dashboard] Booking ${bookingId} cancelled`);
  } catch (error) {
    console.error('[Student Dashboard] Failed to cancel booking:', error);
    const errorBox = document.getElementById('myBookingsError');
    if (errorBox) {
      errorBox.className = 'alert alert-danger';
      errorBox.textContent =
        error.code === 'permission-denied'
          ? 'Could not cancel this booking — your Firestore security rules blocked it.'
          : 'Could not cancel that booking. Please try again.';
    }
  }
}

/**
 * Format an ISO timestamp for display.
 */
function formatPickupTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString || '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
