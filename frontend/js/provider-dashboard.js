/**
 * Provider Dashboard Controller
 * 
 * Manages provider dashboard statistics, vehicle type, pricing, availability status,
 * placeholder actions for future modules, and navigation to the profile editor.
 */

import { requireAuth, logoutUser } from './auth.js';
import { db, isFirebaseConfigured } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showComingSoonModal, closeComingSoonModal, formatMWK } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  // Guard page: Require 'provider' role
  requireAuth('provider', async (user) => {
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
  });

  // Action buttons (Next Module placeholders)
  const myScheduleBtn = document.getElementById('myScheduleBtn');
  if (myScheduleBtn) {
    myScheduleBtn.addEventListener('click', () => {
      showComingSoonModal('My Schedule Management');
    });
  }

  const myBookingsBtn = document.getElementById('myBookingsBtn');
  if (myBookingsBtn) {
    myBookingsBtn.addEventListener('click', () => {
      showComingSoonModal('Provider Booking Management');
    });
  }

  const updatePriceBtn = document.getElementById('updatePriceBtn');
  if (updatePriceBtn) {
    updatePriceBtn.addEventListener('click', () => {
      showComingSoonModal('Quick Price Update Tool');
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
