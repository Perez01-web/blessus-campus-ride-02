/**
 * Provider Profile Controller
 * 
 * Handles loading provider vehicle/pricing profile, editing details,
 * and saving changes directly to Firestore and backend API.
 */

import { requireAuth, logoutUser } from './auth.js';
import { db, isFirebaseConfigured } from './firebase-config.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showAlert, hideAlert, setStoredUser, getStoredUser } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  let currentUid = null;
  const profileForm = document.getElementById('profileForm');
  const saveBtn = document.getElementById('saveBtn');

  // Input Elements
  const nameInput = document.getElementById('providerName');
  const phoneInput = document.getElementById('providerPhone');
  const typeSelect = document.getElementById('providerType');
  const vehicleNameInput = document.getElementById('vehicleName');
  const registrationInput = document.getElementById('vehicleRegistration');
  const priceInput = document.getElementById('price');
  const waitTimeInput = document.getElementById('estimatedWaitTime');
  const availableCheckbox = document.getElementById('available');

  // Guard page: Require 'provider' role
  requireAuth('provider', async (user) => {
    currentUid = user.uid;

    // Prefill user basic info
    if (nameInput) nameInput.value = user.name || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (typeSelect && user.providerType) typeSelect.value = user.providerType;

    // Load full provider profile
    let providerData = null;

    if (db && isFirebaseConfigured) {
      try {
        const snap = await getDoc(doc(db, 'providers', user.uid));
        if (snap.exists()) {
          providerData = snap.data();
        }
      } catch (err) {
        console.warn('Error reading provider doc:', err.message);
      }
    }

    // Try backend API if not yet loaded
    if (!providerData) {
      try {
        const res = await fetch(`/api/provider/profile/${user.uid}`);
        if (res.ok) {
          const json = await res.json();
          providerData = json.data;
        }
      } catch (e) {
        console.warn('Error querying provider API:', e.message);
      }
    }

    // Populate inputs with existing data
    if (providerData) {
      if (vehicleNameInput) vehicleNameInput.value = providerData.vehicleName || '';
      if (registrationInput) registrationInput.value = providerData.vehicleRegistration || '';
      if (priceInput) priceInput.value = providerData.price !== undefined ? providerData.price : 0;
      if (waitTimeInput) waitTimeInput.value = providerData.estimatedWaitTime !== undefined ? providerData.estimatedWaitTime : 10;
      if (availableCheckbox) availableCheckbox.checked = providerData.available !== false;
    }
  });

  // Handle Save Profile Form
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('alertBox');

    if (!currentUid) {
      showAlert('alertBox', 'Session invalid. Please log in again.');
      return;
    }

    const updatedProfile = {
      providerId: currentUid,
      userId: currentUid,
      name: nameInput.value.trim(),
      phone: phoneInput.value.trim(),
      providerType: typeSelect.value,
      vehicleName: vehicleNameInput.value.trim(),
      vehicleRegistration: registrationInput.value.trim(),
      price: Number(priceInput.value) || 0,
      estimatedWaitTime: Number(waitTimeInput.value) || 0,
      available: availableCheckbox.checked,
      updatedAt: new Date().toISOString()
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving Changes...';

    try {
      // 1. Save directly to Firestore if configured
      if (db && isFirebaseConfigured) {
        await setDoc(doc(db, 'providers', currentUid), updatedProfile, { merge: true });
        
        // Also update users collection for name & phone
        await setDoc(doc(db, 'users', currentUid), {
          name: updatedProfile.name,
          phone: updatedProfile.phone,
          providerType: updatedProfile.providerType,
        }, { merge: true });
      }

      // 2. Sync with Backend API
      try {
        await fetch(`/api/provider/profile/${currentUid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedProfile)
        });
      } catch (apiErr) {
        console.warn('Backend sync note:', apiErr.message);
      }

      // 3. Update local storage session
      const cached = getStoredUser();
      if (cached) {
        cached.name = updatedProfile.name;
        cached.phone = updatedProfile.phone;
        cached.providerType = updatedProfile.providerType;
        setStoredUser(cached);
      }

      showAlert('alertBox', 'Provider profile updated successfully!', 'success');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';

      // Scroll to alert
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
      console.error('Failed to update provider profile:', error);
      showAlert('alertBox', 'Failed to save changes. Please try again.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
  }
});
