/**
 * Student Find Transport Controller
 * 
 * Interacts with Firestore and backend API to retrieve available drivers,
 * apply service type filters, and display driver cards with realtime statuses.
 */

import { requireAuth, logoutUser } from '../auth.js';
import { api } from '../api.js';
import { firestoreService } from '../firestore-service.js';

let currentFilter = 'all';
let cachedProviders = [];
let currentStudent = null;
let activeSelectedProvider = null;

document.addEventListener('DOMContentLoaded', () => {
  // Protect page: require student role
  requireAuth('student', (user) => {
    currentStudent = user;
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

  // Logout Button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
  }

  // Preset Location Chips Handlers
  setupChips('pickupChips', 'pickupLocationInput');
  setupChips('destChips', 'destinationInput');

  // Booking Modal Close Handlers
  const bookingModal = document.getElementById('bookingModal');
  const closeBookingModalBtn = document.getElementById('closeBookingModalBtn');
  const cancelBookingBtn = document.getElementById('cancelBookingBtn');
  if (closeBookingModalBtn) closeBookingModalBtn.addEventListener('click', closeBookingModal);
  if (cancelBookingBtn) cancelBookingBtn.addEventListener('click', closeBookingModal);
  if (bookingModal) {
    bookingModal.addEventListener('click', (e) => {
      if (e.target === bookingModal) closeBookingModal();
    });
  }

  // Booking Form Submission
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', handleBookingSubmit);
  }

  // Success Modal Handlers
  const dismissSuccessBtn = document.getElementById('dismissSuccessBtn');
  const bookingSuccessModal = document.getElementById('bookingSuccessModal');
  if (dismissSuccessBtn) {
    dismissSuccessBtn.addEventListener('click', () => {
      if (bookingSuccessModal) bookingSuccessModal.style.display = 'none';
    });
  }
});

function setupChips(containerId, targetInputId) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(targetInputId);
  if (!container || !input) return;

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-btn');
    if (!chip) return;
    input.value = chip.dataset.loc || '';
    container.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
}

function openBookingModal(provider) {
  activeSelectedProvider = provider;
  const modal = document.getElementById('bookingModal');
  if (!modal) return;

  const isTaxi = provider.providerType === 'taxi';
  const avatarEl = document.getElementById('modalDriverAvatar');
  const nameEl = document.getElementById('modalDriverName');
  const vehicleEl = document.getElementById('modalDriverVehicle');
  const fareDisplay = document.getElementById('modalFareDisplay');
  const baseFareInput = document.getElementById('modalBaseFare');
  const providerIdInput = document.getElementById('modalProviderId');

  if (avatarEl) {
    avatarEl.className = `provider-avatar ${isTaxi ? 'taxi' : 'motorbike'}`;
    avatarEl.textContent = isTaxi ? '🚕' : '🏍️';
  }
  if (nameEl) nameEl.textContent = provider.name || 'Campus Driver';
  if (vehicleEl) {
    vehicleEl.textContent = `${provider.vehicleName || (isTaxi ? 'Taxi' : 'Motorbike')} • ${provider.vehicleRegistration || 'Verified'}`;
  }

  const fareNum = Number(provider.price) || 0;
  if (fareDisplay) {
    fareDisplay.textContent = fareNum > 0 ? `MWK ${fareNum.toLocaleString()}` : 'Fare on request / Negotiable';
  }
  if (baseFareInput) baseFareInput.value = fareNum;
  if (providerIdInput) providerIdInput.value = provider.providerId || provider.id;

  // Defaults
  const pickupInput = document.getElementById('pickupLocationInput');
  const destInput = document.getElementById('destinationInput');
  if (pickupInput && !pickupInput.value) pickupInput.value = 'Main Campus Gate';
  if (destInput && !destInput.value) destInput.value = 'Town Central Market';

  modal.style.display = 'flex';
}

function closeBookingModal() {
  const modal = document.getElementById('bookingModal');
  if (modal) modal.style.display = 'none';
  activeSelectedProvider = null;
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  if (!activeSelectedProvider || !currentStudent) return;

  const submitBtn = document.getElementById('submitBookingBtn');
  const pickupLocation = document.getElementById('pickupLocationInput').value.trim();
  const destination = document.getElementById('destinationInput').value.trim();
  const fare = Number(document.getElementById('modalBaseFare').value) || Number(activeSelectedProvider.price) || 0;
  const paymentMethodEl = document.querySelector('input[name="paymentMethod"]:checked');
  const paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'cash';
  const notes = document.getElementById('notesInput').value.trim();

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Request...';
  }

  const bookingPayload = {
    studentId: currentStudent.uid,
    studentName: currentStudent.name || 'Campus Student',
    studentPhone: currentStudent.phone || '',
    providerId: activeSelectedProvider.providerId || activeSelectedProvider.id,
    providerName: activeSelectedProvider.name || 'Campus Driver',
    providerType: activeSelectedProvider.providerType || 'taxi',
    providerPhone: activeSelectedProvider.phone || '',
    vehicleName: activeSelectedProvider.vehicleName || 'Standard Vehicle',
    vehicleRegistration: activeSelectedProvider.vehicleRegistration || '',
    pickupLocation,
    destination,
    fare,
    paymentMethod,
    notes,
  };

  try {
    let result = null;
    // 1. Direct Firestore attempt
    try {
      result = await firestoreService.createBooking(bookingPayload);
    } catch (fsErr) {
      console.warn('[Booking] Firestore write failed, using backend API:', fsErr);
      // 2. Backend API fallback
      result = await api.createBooking(bookingPayload);
    }

    closeBookingModal();

    // Show success dialog
    const successModal = document.getElementById('bookingSuccessModal');
    const successText = document.getElementById('successBookingText');
    if (successText) {
      const typeLabel = activeSelectedProvider.providerType === 'taxi' ? 'taxi' : 'motorbike';
      successText.textContent = `Your ${typeLabel} request to ${activeSelectedProvider.name} from ${pickupLocation} to ${destination} (MWK ${fare.toLocaleString()}) has been sent!`;
    }
    if (successModal) successModal.style.display = 'flex';

  } catch (err) {
    console.error('[Booking Submit Error]:', err);
    alert(`Could not complete booking: ${err.message || 'Please check your connection and try again.'}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Booking';
    }
  }
}

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

    // 1. Try Backend API first for immediate seeded responses
    try {
      providers = await api.getProviders('all');
    } catch (apiErr) {
      console.warn('[Find Transport] API fetch failed, trying Firestore:', apiErr);
      providers = await firestoreService.getAvailableProviders('all');
    }

    // If API returned empty, try firestore
    if (!providers || providers.length === 0) {
      try {
        providers = await firestoreService.getAvailableProviders('all');
      } catch (e) {
        // ignore
      }
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

    // Attach click listeners to Book Ride buttons
    providersGrid.querySelectorAll('.btn-book').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.providerId;
        const provider = cachedProviders.find(p => (p.providerId || p.id) === pId);
        if (provider) {
          openBookingModal(provider);
        }
      });
    });
  }
}

/**
 * Generate card HTML for a driver
 */
function createProviderCardHtml(provider) {
  const isTaxi = provider.providerType === 'taxi';
  const typeLabel = isTaxi ? 'Taxi Driver' : 'Motorbike Driver';
  const avatarEmoji = isTaxi ? '🚕' : '🏍️';
  const typeClass = isTaxi ? 'taxi' : 'motorbike';

  const priceText = provider.price 
    ? `MWK ${Number(provider.price).toLocaleString()}` 
    : 'Fare on request';

  const waitTime = provider.estimatedWaitTime || 10;
  const vehicle = provider.vehicleName || (isTaxi ? 'Taxi' : 'Motorbike');
  const regNumber = provider.vehicleRegistration ? `(${escapeHtml(provider.vehicleRegistration)})` : '';
  const rawPhone = provider.phone || 'Phone upon booking';
  const cleanPhone = (provider.phone || '').replace(/\s+/g, '');
  const ratingBadge = provider.rating 
    ? `<span class="provider-rating-badge">★ ${Number(provider.rating).toFixed(1)} (${provider.completedTrips || 0} trips)</span>`
    : `<span class="provider-rating-badge" style="background: #e0f2fe; color: #0369a1;">Verified Driver</span>`;
  const pId = escapeHtml(provider.providerId || provider.id || '');

  return `
    <div class="provider-card" data-provider-id="${pId}">
      <div>
        <div class="provider-card-top">
          <div class="provider-avatar ${typeClass}">
            ${avatarEmoji}
          </div>
          <span class="status-pill status-available">Available</span>
        </div>

        <h3 class="provider-name">${escapeHtml(provider.name || 'Campus Driver')}</h3>
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span class="provider-type-tag ${typeClass}">${typeLabel}</span>
          ${ratingBadge}
        </div>

        <ul class="provider-details-list">
          <li class="provider-detail-item">
            <span class="provider-detail-icon">🚗</span>
            <span><strong>Vehicle:</strong> ${escapeHtml(vehicle)} ${regNumber}</span>
          </li>
          <li class="provider-detail-item">
            <span class="provider-detail-icon">⏱️</span>
            <span><strong>Est. Pickup:</strong> ~${waitTime} mins</span>
          </li>
          <li class="provider-detail-item">
            <span class="provider-detail-icon">📞</span>
            <span><strong>Contact:</strong> ${escapeHtml(rawPhone)}</span>
          </li>
        </ul>
      </div>

      <div>
        <div class="provider-price-tag">
          <span class="provider-price-label">Trip Fare</span>
          <span class="provider-price-amount">${priceText}</span>
        </div>

        <div class="provider-card-actions">
          <button type="button" class="btn-book" data-provider-id="${pId}">
            Book Ride ⚡
          </button>
          ${cleanPhone ? `
            <a href="tel:${cleanPhone}" class="btn-call" title="Call Driver">
              📞
            </a>
          ` : ''}
        </div>
      </div>
    </div>
  `;
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
