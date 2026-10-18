/**
 * User Login Controller
 * 
 * Handles login via Firebase Authentication (Email/Password & Google),
 * reads the user document from Firestore to determine their role,
 * and redirects to the correct dashboard.
 */

import { auth, db, isFirebaseConfigured, googleProvider, signInWithPopup } from './firebase-config.js';
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showAlert, hideAlert, setStoredUser, redirectByRole, getStoredUser } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const submitBtn = document.getElementById('submitBtn');
  const googleBtn = document.getElementById('googleBtn');

  // Helper to load user profile from Firestore and redirect
  async function completeLogin(uid, fallbackEmail = '', fallbackName = '') {
    let userProfile = null;

    if (db) {
      try {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          userProfile = userDocSnap.data();
          console.log('[Firestore] Successfully retrieved user profile from Firestore:', userProfile);
        } else {
          console.log('[Firestore] User document not found in Firestore. Creating initial student record...');
          // Auto-initialize profile in Firestore for new Google sign-ins
          userProfile = {
            uid: uid,
            name: fallbackName || 'Student',
            email: fallbackEmail,
            phone: '',
            role: 'student',
            createdAt: new Date().toISOString()
          };
          await setDoc(userDocRef, userProfile);
        }
      } catch (firestoreErr) {
        console.warn('[Firestore] Profile read error:', firestoreErr.message);
      }
    }

    // Try backend if Firestore didn't return
    if (!userProfile) {
      try {
        const response = await fetch(`/api/auth/profile/${uid}`);
        if (response.ok) {
          const json = await response.json();
          userProfile = json.data;
        }
      } catch (e) {
        console.warn('Backend API note:', e.message);
      }
    }

    if (!userProfile) {
      userProfile = {
        uid: uid,
        name: fallbackName || 'User',
        email: fallbackEmail,
        phone: '',
        role: 'student',
        createdAt: new Date().toISOString()
      };
    }

    setStoredUser(userProfile);
    showAlert('alertBox', `Welcome back, ${userProfile.name}! Redirecting...`, 'success');

    setTimeout(() => {
      redirectByRole(userProfile.role || 'student');
    }, 800);
  }

  // 1. Email & Password Sign In
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('alertBox');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showAlert('alertBox', 'Please enter your email and password.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging In...';

    try {
      if (auth && isFirebaseConfigured) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await completeLogin(userCredential.user.uid, userCredential.user.email, userCredential.user.displayName);
      } else {
        const cachedUser = getStoredUser();
        const role = cachedUser?.role || 'student';
        redirectByRole(role);
      }

    } catch (error) {
      console.error('Login error:', error);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';

      let message = 'Invalid email or password.';
      if (error.code === 'auth/operation-not-allowed') {
        message = 'Email/Password sign-in is not enabled in Firebase Console. Please verify Email/Password is enabled under Authentication in project campus-ride-503f5.';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = 'Invalid email or password. Please verify your credentials or register a new account.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many failed login attempts. Please try again later.';
      } else if (error.code === 'permission-denied') {
        message = 'Firestore permission denied. Please check your Firestore Security Rules in Firebase Console for campus-ride-503f5.';
      } else if (error.message) {
        message = error.message;
      }

      showAlert('alertBox', message);
    }
  });

  // 2. Google One-Click Sign In
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      hideAlert('alertBox');
      googleBtn.disabled = true;
      googleBtn.textContent = 'Connecting with Google...';

      try {
        const userCredential = await signInWithPopup(auth, googleProvider);
        const user = userCredential.user;
        await completeLogin(user.uid, user.email, user.displayName);

      } catch (error) {
        console.error('Google login error:', error);
        googleBtn.disabled = false;
        googleBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.347 2.825.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          Sign in with Google
        `;
        showAlert('alertBox', error.message || 'Google sign-in was cancelled.');
      }
    });
  }
});
