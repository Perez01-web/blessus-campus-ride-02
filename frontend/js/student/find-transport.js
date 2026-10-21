/**
 * Student Find Transport Controller
 *
 * Interacts with Firestore and the backend API to retrieve available drivers,
 * apply service type filters, display driver cards, and let the student book
 * a specific driver at a specific pickup time.
 */

import { requireAuth, logoutUser } from '../auth.js';
import { api } from '../api.js';
import { firestoreService } from '../firestore-service.js';
import {
  createBooking,
  findDuplicateBooking,
  BOOKING_STATUS,
} from '../bookings-service.js';
import { showAlert, hideAlert, formatMWK } from '../utils.js';

let currentFilter = 'all';
let cachedProviders = [];
let currentUser = null;
let pendingProvider = null;

// Phone icon for the call button (inline so the page needs no extra asset).
const PHONE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>`;

document.addEventListener('DOMContentLoaded', () => {
  // Protect page: require student role
  requireAuth('student', (user) => {
    currentUser = user;
    loadProviders();
  });

  // Filter Buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.type || 'all';
      filterAndRenderProviders();
    });
  });

  // Refresh Button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadProviders();
    });
  }

  // Booking buttons are delegated because the grid is re-rendered on filter changes
  const providersGrid = document.getElementById('providersGrid');
  if (providersGrid) {
    providersGrid.addEventListener('click', (e) => {
      const bookBtn = e.target.closest('.provider-book-btn');
      if (bookBtn) {
        e.preventDefault();
        openBookingModal(bookBtn.dataset.providerId);
      }
    });
  }

  // Booking Modal controls
  const bookingModal = document.getElementById('bookingModal');
  const bookingForm = document.getElementById('bookingForm');
  const cancelBookingBtn = document.getElementById('cancelBookingBtn');
  const confirmBookingBtn = document.getElementById('confirmBookingBtn');

  if (cancelBookingBtn) {
    cancelBookingBtn.addEventListener('click', closeBookingModal);
  }

  if (bookingModal) {
    bookingModal.addEventListener('click', (e) => {
      if (e.target === bookingModal) closeBookingModal();
    });
  }

  if (bookingForm) {
    bookingForm.addEventListener('submit', submitBooking);
  }

  // Logout Button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
  }
});

/**
 * Load providers from Firestore with backend API fallback
 */
async function loadProviders() {
  const loadingState = document.getElementById('loadingState');
  const providersGrid = document.getElementById('providersGrid');
  const emptyState = document.getElementById('emptyState');
  const alertBox = document.getElementById('alertBox');

  if (loadingState) loadingState.style.display = 'block';
  if (providersGrid) providersGrid.style.display = 'none';
  if (emptyState) emptyState.style.display = 'none';
  if (alertBox) {
    alertBox.className = 'alert hidden';
    alertBox.textContent = '';
  }

  try {
    let providers = [];

    // 1. Primary: Direct Firestore read
    try {
      providers = await firestoreService.getAvailableProviders('all');
    } catch (fsErr) {
      console.warn('[Find Transport] Direct Firestore read failed, falling back to backend API:', fsErr);
      // 2. Fallback: Backend API
      providers = await api.getProviders('all');
    }

    cachedProviders = providers || [];
    filterAndRenderProviders();
  } catch (err) {
    console.error('[Find Transport Error] Failed to load providers:', err);
    if (loadingState) loadingState.style.display = 'none';
    if (alertBox) {
      alertBox.className = 'alert alert-danger';
      alertBox.textContent = `Could not load drivers: ${err.message || 'Network error'}. Please try again.`;
    }
  }
}

/**
 * Filter cached providers and render cards
 */
function filterAndRenderProviders() {
  const loadingState = document.getElementById('loadingState');
  const providersGrid = document.getElementById('providersGrid');
  const emptyState = document.getElementById('emptyState');

  if (loadingState) loadingState.style.display = 'none';

  let list = cachedProviders;
  if (currentFilter && currentFilter !== 'all') {
    list = list.filter(p => p.providerType === currentFilter);
  }

  if (list.length === 0) {
    if (providersGrid) providersGrid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (providersGrid) {
    providersGrid.style.display = 'grid';
    providersGrid.innerHTML = list.map(p => createProviderCardHtml(p)).join('');
  }
}

/**
 * Normalise a phone number into a tel: friendly value.
 * Returns an empty string when there is no usable number.
 */
function toTelHref(phone) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  return cleaned.length >= 6 ? cleaned : '';
}

/**
 * Work out how a provider should be presented to students.
 *
 * - 'available' : bookable right now
 * - 'away'      : temporarily away with a known return time ("Back at 8:18 PM")
 */
function getProviderAvailability(provider) {
  if (!provider || provider.available !== false) {
    return { state: 'available', label: 'Available', pillClass: 'status-available', until: null };
  }

  const until = provider.availableUntil || null;
  const untilMs = until ? new Date(until).getTime() : NaN;

  if (!Number.isNaN(untilMs) && untilMs > Date.now()) {
    return {
      state: 'away',
      label: `Back at ${formatClockTime(until)}`,
      pillClass: 'status-away',
      until,
    };
  }

  return { state: 'available', label: 'Available', pillClass: 'status-available', until: null };
}

/**
 * Format a timestamp as a short clock time (e.g. "8:18 PM").
 */
function formatClockTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Generate card HTML for a driver
 */
function createProviderCardHtml(provider) {
  const isTaxi = provider.providerType === 'taxi';
  const typeLabel = isTaxi ? 'Taxi Driver' : 'Motorbike Driver';
  const avatarEmoji = isTaxi ? '🚕' : '🏍️';
  const typeClass = isTaxi ? 'taxi' : 'motorbike';

  const providerId = provider.providerId || provider.id || '';
  const displayName = provider.name || 'Campus Driver';
  const price = Number(provider.price) || 0;
  const priceText = price ? formatMWK(price) : 'Fare on request';

  const waitTime = provider.estimatedWaitTime || 10;
  const vehicle = provider.vehicleName || (isTaxi ? 'Standard Taxi' : 'Standard Motorbike');
  const regNumber = provider.vehicleRegistration ? `(${escapeHtml(provider.vehicleRegistration)})` : '';
  const phone = provider.phone || 'Contact via app';
  const telHref = toTelHref(provider.phone);

  const availability = getProviderAvailability(provider);
  const isAway = availability.state === 'away';

  const callButton = telHref
    ? `<a class="provider-call-btn" href="tel:${escapeHtml(telHref)}"
             title="Call ${escapeHtml(displayName)}" aria-label="Call ${escapeHtml(displayName)}">
         ${PHONE_ICON}
       </a>`
    : `<span class="provider-call-btn" title="No phone number available"
                aria-label="No phone number available" aria-disabled="true">
         ${PHONE_ICON}
       </span>`;

  const bookButton = isAway
    ? `<button type="button" class="provider-book-btn" disabled
             title="This driver is back at ${escapeHtml(formatClockTime(availability.until))}. Please check back then.">
         Back soon
       </button>`
    : `<button type="button" class="provider-book-btn" data-provider-id="${escapeHtml(providerId)}">
         Book
       </button>`;

  const awayNote = isAway
    ? `<p class="provider-away-note">⏳ Away right now — back at ${escapeHtml(formatClockTime(availability.until))}</p>`
    : '';

  return `
    <div class="provider-card${isAway ? ' is-away' : ''}" data-provider-id="${escapeHtml(providerId)}">
      <div>
        <div class="provider-card-top">
          <div class="provider-avatar ${typeClass}">
            ${avatarEmoji}
          </div>
          <span class="status-pill ${availability.pillClass}">${escapeHtml(availability.label)}</span>
        </div>

        <h3 class="provider-name">${escapeHtml(displayName)}</h3>
        <span class="provider-type-tag ${typeClass}">${typeLabel}</span>

        <ul class="provider-details-list">
          <li class="provider-detail-item">
            <span class="provider-detail-icon">🚗</span>
            <span><strong>Vehicle:</strong> ${escapeHtml(vehicle)} ${regNumber}</span>
          </li>
          <li class="provider-detail-item">
            <span class="provider-detail-icon">⏱️</span>
            <span><strong>Est. Pickup:</strong> ~${waitTime} mins</span>
          </li>
          <li class="provider-detail-item fare">
            <span class="provider-detail-icon">💰</span>
            <span><strong>Trip Fare:</strong> ${escapeHtml(priceText)}</span>
          </li>
          <li class="provider-detail-item">
            <span class="provider-detail-icon">📞</span>
            <span><strong>Contact:</strong> ${escapeHtml(phone)}</span>
          </li>
        </ul>

        ${awayNote}
      </div>

      <div class="provider-card-actions">
        ${bookButton}
        ${callButton}
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------
   Booking Flow
   ------------------------------------------------------------------------- */

/**
 * Format a Date as a value accepted by <input type="datetime-local">
 */
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Format an ISO timestamp for display, e.g. "Wed, 21 Oct 2026 · 14:30"
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

/**
 * Open the booking modal for a given provider.
 */
function openBookingModal(providerId) {
  const provider = cachedProviders.find(
    p => (p.providerId || p.id || '') === providerId
  );

  if (!provider) {
    showAlert('alertBox', 'That driver is no longer available. Please refresh the list.');
    return;
  }

  const availability = getProviderAvailability(provider);
  if (availability.state === 'away') {
    showAlert(
      'alertBox',
      `${provider.name || 'This driver'} is away until ${formatClockTime(availability.until)}. Please check back then.`
    );
    return;
  }

  pendingProvider = provider;

  const isTaxi = provider.providerType === 'taxi';
  const price = Number(provider.price) || 0;
  const waitTime = provider.estimatedWaitTime || 10;

  setText('bookingProviderName', provider.name || 'Campus Driver');
  setText('bookingProviderType', isTaxi ? 'Taxi Driver' : 'Motorbike Driver');
  setText(
    'bookingVehicleName',
    provider.vehicleName || (isTaxi ? 'Standard Taxi' : 'Standard Motorbike')
  );
  setText('bookingFare', price ? formatMWK(price) : 'Fare on request');

  // Default pickup = now + the driver's average wait time
  const defaultPickup = new Date(Date.now() + waitTime * 60 * 1000);
  const pickupInput = document.getElementById('pickupTime');
  if (pickupInput) {
    pickupInput.value = toLocalInputValue(defaultPickup);
    pickupInput.min = toLocalInputValue(new Date());
  }

  setText(
    'pickupTimeHint',
    `This driver's average pickup time is ${waitTime} minutes. Adjust if you need a different time.`
  );

  hideBookingModalAlert();

  const modal = document.getElementById('bookingModal');
  if (modal) modal.classList.add('active');
}

/**
 * Close the booking modal and reset its state.
 */
function closeBookingModal() {
  const modal = document.getElementById('bookingModal');
  if (modal) modal.classList.remove('active');
  pendingProvider = null;

  const confirmBtn = document.getElementById('confirmBookingBtn');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm Booking';
  }
  hideBookingModalAlert();
}

/**
 * Show an inline error inside the booking modal.
 */
function showBookingModalAlert(message) {
  const box = document.getElementById('bookingModalAlert');
  if (!box) return;
  box.className = 'alert alert-danger';
  box.textContent = message;
}

/**
 * Clear the inline booking modal error.
 */
function hideBookingModalAlert() {
  const box = document.getElementById('bookingModalAlert');
  if (!box) return;
  box.className = 'alert hidden';
  box.textContent = '';
}

/**
 * Set text content of an element by id.
 */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * Handle the booking form submission.
 */
async function submitBooking(e) {
  e.preventDefault();
  hideBookingModalAlert();

  if (!pendingProvider || !currentUser) {
    showBookingModalAlert('Your session has expired. Please log in again.');
    return;
  }

  const pickupInput = document.getElementById('pickupTime');
  const rawPickup = pickupInput ? pickupInput.value : '';
  const confirmBtn = document.getElementById('confirmBookingBtn');

  if (!rawPickup) {
    showBookingModalAlert('Please choose a pickup time.');
    return;
  }

  const pickupDate = new Date(rawPickup);
  if (Number.isNaN(pickupDate.getTime())) {
    showBookingModalAlert('That pickup time could not be read. Please choose another.');
    return;
  }

  if (pickupDate.getTime() <= Date.now()) {
    showBookingModalAlert('Pickup time must be in the future.');
    return;
  }

  const providerId = pendingProvider.providerId || pendingProvider.id || '';
  const pickupTime = pickupDate.toISOString();

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Booking...';
  }

  try {
    // Guard against accidental double submissions
    const duplicate = await findDuplicateBooking(currentUser.uid, providerId, pickupTime);
    if (duplicate) {
      showBookingModalAlert(
        'You already have a booking with this driver at that time. Check "My Bookings" on your dashboard.'
      );
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm Booking';
      }
      return;
    }

    const booking = await createBooking({
      studentId: currentUser.uid,
      studentName: currentUser.name || 'Student',
      studentPhone: currentUser.phone || '',
      providerId: providerId,
      providerName: pendingProvider.name || '',
      providerPhone: pendingProvider.phone || '',
      providerType: pendingProvider.providerType || 'taxi',
      vehicleName: pendingProvider.vehicleName || '',
      pickupTime: pickupTime,
      fare: Number(pendingProvider.price) || 0,
      estimatedWaitTime: Number(pendingProvider.estimatedWaitTime) || 10,
    });

    // Mirror the booking to the backend for API parity / audit trail
    try {
      await api.createBooking(booking);
    } catch (apiErr) {
      console.warn('[Find Transport] Backend booking sync note:', apiErr.message);
    }

    const providerName = pendingProvider.name || 'the driver';
    closeBookingModal();

    showAlert(
      'alertBox',
      `Booking requested with ${providerName} for ${formatPickupTime(pickupTime)}. Track it under "My Bookings".`,
      'success'
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('[Find Transport] Booking failed:', error);
    showBookingModalAlert(
      error.code === 'permission-denied'
        ? 'Booking permission denied. Please check your Firestore security rules.'
        : 'Could not complete the booking. Please try again.'
    );
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Booking';
    }
  }
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
