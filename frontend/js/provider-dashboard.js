/**
 * Provider Dashboard Controller
 * 
 * Manages provider dashboard statistics, vehicle type, pricing, availability status,
 * placeholder actions for future modules, and navigation to the profile editor.
 */

import { requireAuth, logoutUser } from './auth.js';
import { db, isFirebaseConfigured } from './firebase-config.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showComingSoonModal, closeComingSoonModal, formatMWK } from './utils.js';
import { api } from './api.js';

let currentProviderUser = null;
let currentProviderData = null;

document.addEventListener('DOMContentLoaded', () => {
  // Guard page: Require 'provider' role
  requireAuth('provider', async (user) => {
    currentProviderUser = user;
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
    currentProviderData = providerData;
  });

  // Action buttons
  const priceModal = document.getElementById('priceModal');
  const updatePriceBtn = document.getElementById('updatePriceBtn');
  const closePriceModalBtn = document.getElementById('closePriceModalBtn');
  const saveQuickPriceBtn = document.getElementById('saveQuickPriceBtn');
  const quickPriceInput = document.getElementById('quickPriceInput');

  if (updatePriceBtn) {
    updatePriceBtn.addEventListener('click', () => {
      const currentPrice = currentProviderData?.price || 0;
      if (quickPriceInput) quickPriceInput.value = currentPrice;
      if (priceModal) priceModal.style.display = 'flex';
    });
  }

  if (closePriceModalBtn) {
    closePriceModalBtn.addEventListener('click', () => {
      if (priceModal) priceModal.style.display = 'none';
    });
  }

  // Quick price modifier buttons
  document.getElementById('pricePlus500')?.addEventListener('click', () => {
    if (quickPriceInput) quickPriceInput.value = (Number(quickPriceInput.value) || 0) + 500;
  });
  document.getElementById('priceMinus500')?.addEventListener('click', () => {
    if (quickPriceInput) quickPriceInput.value = Math.max(500, (Number(quickPriceInput.value) || 0) - 500);
  });
  document.getElementById('priceSet2000')?.addEventListener('click', () => {
    if (quickPriceInput) quickPriceInput.value = 2000;
  });
  document.getElementById('priceSet5000')?.addEventListener('click', () => {
    if (quickPriceInput) quickPriceInput.value = 5000;
  });

  if (saveQuickPriceBtn) {
    saveQuickPriceBtn.addEventListener('click', async () => {
      if (!currentProviderUser) return;
      const newPrice = Number(quickPriceInput.value) || 0;
      saveQuickPriceBtn.disabled = true;
      saveQuickPriceBtn.textContent = 'Saving...';

      try {
        await api.updateProviderProfile(currentProviderUser.uid, { price: newPrice });
        if (db && isFirebaseConfigured) {
          try {
            await updateDoc(doc(db, 'providers', currentProviderUser.uid), { price: newPrice });
          } catch (e) { /* ignore */ }
        }

        const providerPriceEl = document.getElementById('providerPrice');
        if (providerPriceEl) providerPriceEl.textContent = formatMWK(newPrice);
        if (currentProviderData) currentProviderData.price = newPrice;

        if (priceModal) priceModal.style.display = 'none';
      } catch (err) {
        alert('Failed to update price: ' + err.message);
      } finally {
        saveQuickPriceBtn.disabled = false;
        saveQuickPriceBtn.textContent = 'Save Price';
      }
    });
  }

  // Schedule Modal
  const scheduleModal = document.getElementById('scheduleModal');
  const myScheduleBtn = document.getElementById('myScheduleBtn');
  const closeScheduleModalBtn = document.getElementById('closeScheduleModalBtn');
  const scheduleForm = document.getElementById('scheduleForm');

  if (myScheduleBtn) {
    myScheduleBtn.addEventListener('click', () => {
      const isAvailable = currentProviderData?.available !== false;
      const dutySelect = document.getElementById('scheduleDutyStatus');
      if (dutySelect) dutySelect.value = isAvailable ? 'true' : 'false';
      if (scheduleModal) scheduleModal.style.display = 'flex';
    });
  }

  if (closeScheduleModalBtn) {
    closeScheduleModalBtn.addEventListener('click', () => {
      if (scheduleModal) scheduleModal.style.display = 'none';
    });
  }

  if (scheduleForm) {
    scheduleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentProviderUser) return;

      const saveBtn = document.getElementById('saveScheduleBtn');
      const isAvailable = document.getElementById('scheduleDutyStatus').value === 'true';
      const zone = document.getElementById('scheduleZone').value;

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      try {
        await api.updateProviderProfile(currentProviderUser.uid, { 
          available: isAvailable,
          campusZone: zone 
        });

        if (db && isFirebaseConfigured) {
          try {
            await updateDoc(doc(db, 'providers', currentProviderUser.uid), { 
              available: isAvailable,
              campusZone: zone 
            });
          } catch (e) { /* ignore */ }
        }

        const providerStatusPill = document.getElementById('providerStatusPill');
        if (providerStatusPill) {
          if (isAvailable) {
            providerStatusPill.className = 'status-pill status-available';
            providerStatusPill.textContent = 'Available for Trips';
          } else {
            providerStatusPill.className = 'status-pill status-unavailable';
            providerStatusPill.textContent = 'Unavailable';
          }
        }
        if (currentProviderData) currentProviderData.available = isAvailable;

        if (scheduleModal) scheduleModal.style.display = 'none';
      } catch (err) {
        alert('Failed to update schedule: ' + err.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Schedule';
        }
      }
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
