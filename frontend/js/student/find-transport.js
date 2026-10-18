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

document.addEventListener('DOMContentLoaded', () => {
  // Protect page: require student role
  requireAuth('student', (user) => {
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
  const vehicle = provider.vehicleName || (isTaxi ? 'Standard Taxi' : 'Standard Motorbike');
  const regNumber = provider.vehicleRegistration ? `(${escapeHtml(provider.vehicleRegistration)})` : '';
  const phone = provider.phone || 'Contact via app';

  return `
    <div class="provider-card" data-provider-id="${escapeHtml(provider.providerId || provider.id || '')}">
      <div>
        <div class="provider-card-top">
          <div class="provider-avatar ${typeClass}">
            ${avatarEmoji}
          </div>
          <span class="status-pill status-available">Available</span>
        </div>

        <h3 class="provider-name">${escapeHtml(provider.name || 'Campus Driver')}</h3>
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
          <li class="provider-detail-item">
            <span class="provider-detail-icon">📞</span>
            <span><strong>Contact:</strong> ${escapeHtml(phone)}</span>
          </li>
        </ul>
      </div>

      <div>
        <div class="provider-price-tag">
          <span class="provider-price-label">Trip Fare</span>
          <span class="provider-price-amount">${priceText}</span>
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
