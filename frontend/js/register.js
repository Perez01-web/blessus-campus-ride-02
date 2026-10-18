/**
 * User Registration Controller
 * 
 * Handles client-side validation, role toggling, Firebase Auth registration,
 * Google sign-in/registration, Firestore database writes, and navigation.
 */

import { auth, db, isFirebaseConfigured, googleProvider, signInWithPopup } from './firebase-config.js';
import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showAlert, hideAlert, setStoredUser, redirectByRole } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const roleRadios = document.querySelectorAll('input[name="accountType"]');
  const roleStudentCard = document.getElementById('roleStudentCard');
  const roleProviderCard = document.getElementById('roleProviderCard');
  const providerTypeContainer = document.getElementById('providerTypeContainer');
  const typeTaxiCard = document.getElementById('typeTaxiCard');
  const typeMotorbikeCard = document.getElementById('typeMotorbikeCard');
  const submitBtn = document.getElementById('submitBtn');
  const googleBtn = document.getElementById('googleBtn');

  // 1. Toggle Account Type (Student vs Service Provider)
  roleRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selectedRole = e.target.value;

      if (selectedRole === 'student') {
        roleStudentCard.classList.add('active');
        roleProviderCard.classList.remove('active');
        providerTypeContainer.classList.add('hidden');
      } else {
        roleProviderCard.classList.add('active');
        roleStudentCard.classList.remove('active');
        providerTypeContainer.classList.remove('hidden');
      }
    });
  });

  // 2. Toggle Provider Type (Taxi vs Motorbike)
  const providerTypeRadios = document.querySelectorAll('input[name="providerType"]');
  providerTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'taxi') {
        typeTaxiCard.classList.add('active');
        typeMotorbikeCard.classList.remove('active');
      } else {
        typeMotorbikeCard.classList.add('active');
        typeTaxiCard.classList.remove('active');
      }
    });
  });

  // Helper function to save profile to Firestore & backend
  async function saveUserProfileToDatabase(uid, fullName, email, phone, role, providerType) {
    const userProfile = {
      uid: uid,
      name: fullName,
      email: email,
      phone: phone,
      role: role,
      createdAt: new Date().toISOString()
    };

    if (role === 'provider') {
      userProfile.providerType = providerType;
    }

    // 1. Write to Firestore 'users' collection
    if (db) {
      await setDoc(doc(db, 'users', uid), userProfile, { merge: true });
      console.log('[Firestore] User document written to users/' + uid);
    }

    // 2. If provider, initialize 'providers' collection
    if (role === 'provider' && db) {
      const providerProfile = {
        providerId: uid,
        userId: uid,
        name: fullName,
        providerType: providerType,
        phone: phone,
        vehicleName: '',
        vehicleRegistration: '',
        price: 0,
        estimatedWaitTime: 10,
        available: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'providers', uid), providerProfile, { merge: true });
      console.log('[Firestore] Provider document written to providers/' + uid);
    }

    // 3. Sync with backend API
    try {
      await fetch('/api/auth/register-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userProfile)
      });
    } catch (apiErr) {
      console.warn('Backend sync note:', apiErr.message);
    }

    // 4. Save local session cache
    setStoredUser(userProfile);
    return userProfile;
  }

  // 3. Email & Password Form Submission
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('alertBox');

    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    const selectedRoleElement = document.querySelector('input[name="accountType"]:checked');
    if (!selectedRoleElement) {
      showAlert('alertBox', 'Please select an account type (Student or Service Provider).');
      return;
    }
    const role = selectedRoleElement.value; // 'student' or 'provider'

    let providerType = null;
    if (role === 'provider') {
      const selectedTypeElement = document.querySelector('input[name="providerType"]:checked');
      if (!selectedTypeElement) {
        showAlert('alertBox', 'Please select Taxi or Motorbike.');
        return;
      }
      providerType = selectedTypeElement.value; // 'taxi' or 'motorbike'
    }

    // Validation
    if (!fullName || !email || !phone || !password || !confirmPassword) {
      showAlert('alertBox', 'Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      showAlert('alertBox', 'Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      showAlert('alertBox', 'Passwords do not match.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    try {
      let uid = null;

      if (auth && isFirebaseConfigured) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        uid = userCredential.user.uid;
      } else {
        uid = 'usr_' + Date.now().toString(36);
      }

      await saveUserProfileToDatabase(uid, fullName, email, phone, role, providerType);

      showAlert('alertBox', 'Account created and saved to Firestore! Redirecting...', 'success');
      setTimeout(() => {
        redirectByRole(role);
      }, 1000);

    } catch (error) {
      console.error('Registration error:', error);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';

      let message = 'Something went wrong. Please try again.';
      if (error.code === 'auth/operation-not-allowed') {
        message = 'Email/Password sign-in is not enabled in Firebase Console. Please verify Email/Password is enabled under Authentication in project campus-ride-503f5.';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'An account with this email already exists. Please log in.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Password is too weak. Please use at least 6 characters.';
      } else if (error.code === 'permission-denied') {
        message = 'Firestore permission denied. Please check your Firestore Security Rules in Firebase Console for campus-ride-503f5.';
      } else if (error.message) {
        message = error.message;
      }
      showAlert('alertBox', message);
    }
  });

  // 4. Google One-Click Registration
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      hideAlert('alertBox');

      const selectedRoleElement = document.querySelector('input[name="accountType"]:checked');
      const role = selectedRoleElement ? selectedRoleElement.value : 'student';

      let providerType = null;
      if (role === 'provider') {
        const selectedTypeElement = document.querySelector('input[name="providerType"]:checked');
        providerType = selectedTypeElement ? selectedTypeElement.value : 'taxi';
      }

      const phone = document.getElementById('phone').value.trim() || '';

      googleBtn.disabled = true;
      googleBtn.textContent = 'Connecting with Google...';

      try {
        const userCredential = await signInWithPopup(auth, googleProvider);
        const user = userCredential.user;
        const displayName = user.displayName || document.getElementById('fullName').value.trim() || 'User';

        await saveUserProfileToDatabase(user.uid, displayName, user.email, phone, role, providerType);

        showAlert('alertBox', 'Google account registered and saved to Firestore! Redirecting...', 'success');
        setTimeout(() => {
          redirectByRole(role);
        }, 1000);

      } catch (error) {
        console.error('Google sign-in error:', error);
        googleBtn.disabled = false;
        googleBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.347 2.825.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        `;
        showAlert('alertBox', error.message || 'Google registration was cancelled or failed.');
      }
    });
  }
});
