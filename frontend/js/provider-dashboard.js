/**
 * Provider Dashboard Controller
 *
 * Manages provider dashboard statistics, vehicle type, pricing, availability status,
 * and the live ride request feed that reflects bookings made by students.
 */

import { requireAuth, logoutUser } from './auth.js';
import { db, isFirebaseConfigured } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {
  subscribeToProviderBookings,
  updateBookingStatus,
  BOOKING_STATUS,
} from './bookings-service.js';
import { showComingSoonModal, closeComingSoonModal, formatMWK } from './utils.js';

let providerUid = null;
let bookingsUnsubscribe = null;

document.addEventListener('DOMContentLoaded', () => {
  // Guard page: Require 'provider' role
  requireAuth('provider', async (user) => {
    providerUid = user.uid;

    // 1. Render Basic User Details
    const providerNameEl = document.getElementById('providerName');
    const providerTypeEl = document.getElementById('providerType');
    const providerStatusPill = document.getElementById('providerStatusPill');
    const providerPriceEl = document.getElementById('providerPrice');
    const providerWaitTimeEl = document.getElementById('providerWaitTime');
    const providerVehicleEl = document.getElementById('providerVehicle');

    if (providerNameEl) providerNameEl.textContent = user.name || 'Provider';

    const pType = user.providerType || 'taxi';
    if (providerTypeEl) {
      providerTypeEl.textContent = pType === 'taxi' ? 'Taxi Driver' : 'Motorbike Owner';
    }

    // 2. Load Provider Profile Document from Firestore or Backend
    let providerData = null;

    if (db && isFirebaseConfigured) {
      try {
        const providerSnap = await getDoc(doc(db, 'providers', user.uid));
        if (providerSnap.exists()) {
          providerData = providerSnap.data();
        }
      } catch (err) {
        console.warn('Firestore fetch error:', err.message);
      }
    }

    // Fallback to backend API if needed
    if (!providerData) {
      try {
        const res = await fetch(`/api/provider/profile/${user.uid}`);
        if (res.ok) {
          const json = await res.json();
          providerData = json.data;
        }
      } catch (e) {
        console.warn('API fetch error:', e.message);
      }
    }

    // Default values if no profile created yet
    const price = providerData && providerData.price !== undefined ? providerData.price : 0;
    const waitTime = providerData && providerData.estimatedWaitTime !== undefined ? providerData.estimatedWaitTime : 10;
    const isAvailable = providerData ? providerData.available !== false : true;
    const vehicleName = providerData && providerData.vehicleName ? providerData.vehicleName : 'Vehicle not registered';

    if (providerPriceEl) providerPriceEl.textContent = formatMWK(price);
    if (providerWaitTimeEl) providerWaitTimeEl.textContent = `${waitTime} minutes`;
    if (providerVehicleEl) providerVehicleEl.textContent = vehicleName;

    if (providerStatusPill) {
      if (isAvailable) {
        providerStatusPill.className = 'status-pill status-available';
        providerStatusPill.textContent = 'Available for Trips';
      } else {
        providerStatusPill.className = 'status-pill status-unavailable';
        providerStatusPill.textContent = 'Unavailable';
      }
    }

    // 3. Start the live ride request feed
    startBookingsSubscription();
  });

  // Action buttons (Next Module placeholders)
  const myScheduleBtn = document.getElementById('myScheduleBtn');
  if (myScheduleBtn) {
    myScheduleBtn.addEventListener('click', () => {
      showComingSoonModal('My Schedule Management');
    });
  }

  // My Bookings now scrolls to the live ride request feed
  const myBookingsBtn = document.getElementById('myBookingsBtn');
  if (myBookingsBtn) {
    myBookingsBtn.addEventListener('click', () => {
      const section = document.getElementById('bookingsSection');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  const updatePriceBtn = document.getElementById('updatePriceBtn');
  if (updatePriceBtn) {
    updatePriceBtn.addEventListener('click', () => {
      showComingSoonModal('Quick Price Update Tool');
    });
  }

  // Ride request action buttons (delegated - list is re-rendered on updates)
  const bookingsList = document.getElementById('bookingsList');
  if (bookingsList) {
    bookingsList.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-booking-action]');
      if (!actionBtn) return;

      const bookingId = actionBtn.dataset.bookingId;
      const action = actionBtn.dataset.bookingAction;

      if (action === 'accept') {
        handleBookingAction(bookingId, BOOKING_STATUS.ACCEPTED);
      } else if (action === 'reject') {
        handleBookingAction(bookingId, BOOKING_STATUS.REJECTED);
      } else if (action === 'complete') {
        handleBookingAction(bookingId, BOOKING_STATUS.COMPLETED);
      }
    });
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
 * Subscribe to bookings addressed to this provider and keep the UI in sync.
 */
function startBookingsSubscription() {
  if (!providerUid) return;

  bookingsUnsubscribe = subscribeToProviderBookings(
    providerUid,
    renderBookings,
    (err) => {
      console.error('[Provider Dashboard] Booking feed error:', err.message);
      const list = document.getElementById('bookingsList');
      if (list) list.innerHTML = '';
      const empty = document.getElementById('bookingsEmpty');
      if (empty) {
        empty.style.display = 'block';
        const desc = empty.querySelector('.empty-state-desc');
        if (desc) {
          desc.textContent =
            'Live ride requests could not be loaded. Please refresh the page or check your Firestore security rules.';
        }
      }
    }
  );
}

/**
 * Render the live ride request list.
 * @param {Array<Object>} bookings
 */
function renderBookings(bookings) {
  const listEl = document.getElementById('bookingsList');
  const emptyEl = document.getElementById('bookingsEmpty');
  const badgeEl = document.getElementById('bookingCountBadge');
  const countEl = document.getElementById('providerRequestsCount');
  const noteEl = document.getElementById('providerRequestsNote');

  if (!listEl) return;

  const pendingCount = bookings.filter(b => b.status === BOOKING_STATUS.PENDING).length;

  // Counters
  if (badgeEl) {
    badgeEl.textContent = String(bookings.length);
    badgeEl.classList.toggle('is-zero', bookings.length === 0);
  }
  if (countEl) countEl.textContent = String(bookings.length);
  if (noteEl) {
    noteEl.textContent = pendingCount > 0
      ? `${pendingCount} awaiting your response`
      : 'No pending requests';
  }

  if (bookings.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  listEl.innerHTML = bookings.map(createBookingItemHtml).join('');
}

/**
 * Build the HTML for a single ride request card.
 */
function createBookingItemHtml(booking) {
  const status = booking.status || BOOKING_STATUS.PENDING;
  const statusLabel = {
    [BOOKING_STATUS.PENDING]: 'Pending',
    [BOOKING_STATUS.ACCEPTED]: 'Accepted',
    [BOOKING_STATUS.REJECTED]: 'Declined',
    [BOOKING_STATUS.COMPLETED]: 'Completed',
    [BOOKING_STATUS.CANCELLED]: 'Cancelled',
  }[status] || status;

  const pickupLabel = formatPickupTime(booking.pickupTime);
  const isPast = booking.pickupTime && new Date(booking.pickupTime).getTime() < Date.now();
  const fare = Number(booking.fare) || 0;

  const studentName = escapeHtml(booking.studentName || 'Student');
  const studentPhone = escapeHtml(booking.studentPhone || '');
  const telHref = String(booking.studentPhone || '').replace(/[^\d+]/g, '');

  let actions = '';
  if (status === BOOKING_STATUS.PENDING) {
    actions = `
      <button type="button" class="btn btn-primary" data-booking-action="accept" data-booking-id="${escapeHtml(booking.id || booking.bookingId || '')}">
        Accept
      </button>
      <button type="button" class="btn btn-outline-danger" data-booking-action="reject" data-booking-id="${escapeHtml(booking.id || booking.bookingId || '')}">
        Decline
      </button>
      ${telHref.length >= 6 ? `<a class="btn btn-secondary" href="tel:${escapeHtml(telHref)}">Call Student</a>` : ''}
    `;
  } else if (status === BOOKING_STATUS.ACCEPTED) {
    actions = `
      <button type="button" class="btn btn-primary" data-booking-action="complete" data-booking-id="${escapeHtml(booking.id || booking.bookingId || '')}">
        Mark Completed
      </button>
      ${telHref.length >= 6 ? `<a class="btn btn-secondary" href="tel:${escapeHtml(telHref)}">Call Student</a>` : ''}
    `;
  } else {
    actions = `<span class="booking-item-empty-note">This request is closed. No further action needed.</span>`;
  }

  return `
    <div class="booking-item is-${escapeHtml(status)}" data-booking-id="${escapeHtml(booking.id || booking.bookingId || '')}">
      <div class="booking-item-top">
        <h3 class="booking-student-name">${studentName}</h3>
        <span class="booking-status status-${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
      </div>

      <ul class="booking-details-list">
        <li class="booking-detail-item">
          <span>🕒</span>
          <strong>Pickup:</strong> ${escapeHtml(pickupLabel)}
          ${isPast && status !== BOOKING_STATUS.COMPLETED ? '<span class="booking-status status-cancelled">Time passed</span>' : ''}
        </li>
        <li class="booking-detail-item">
          <span>💰</span>
          <strong>Fare:</strong> ${escapeHtml(fare ? formatMWK(fare) : 'Fare on request')}
        </li>
        <li class="booking-detail-item">
          <span>📞</span>
          <strong>Contact:</strong> ${studentPhone || 'Not provided'}
        </li>
        <li class="booking-detail-item">
          <span>🚕</span>
          <strong>Service:</strong> ${escapeHtml(booking.providerType === 'motorbike' ? 'Motorbike Driver' : 'Taxi Driver')}
          ${booking.vehicleName ? ` — ${escapeHtml(booking.vehicleName)}` : ''}
        </li>
      </ul>

      <div class="booking-item-actions">
        ${actions}
      </div>
    </div>
  `;
}

/**
 * Apply a status change to a booking.
 */
async function handleBookingAction(bookingId, status) {
  if (!bookingId) return;

  try {
    await updateBookingStatus(bookingId, status);
    console.log(`[Provider Dashboard] Booking ${bookingId} set to ${status}`);
  } catch (error) {
    console.error('[Provider Dashboard] Failed to update booking:', error);
    const list = document.getElementById('bookingsList');
    if (list) {
      list.insertAdjacentHTML(
        'afterbegin',
        `<div class="alert alert-danger">Could not update that request. Please try again.</div>`
      );
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
