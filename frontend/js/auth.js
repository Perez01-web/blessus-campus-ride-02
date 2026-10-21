/**
 * Core Authentication Manager
 * 
 * Handles logout, auth guards, and Firebase session verification.
 */

import { auth, db, isFirebaseConfigured } from './firebase-config.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { clearStoredUser, getStoredUser, setStoredUser, getAppPath } from './utils.js';

/**
 * Log out user from Firebase Auth and clear local session
 */
export async function logoutUser() {
  try {
    if (auth && isFirebaseConfigured) {
      await signOut(auth);
    }
  } catch (error) {
    console.warn('Sign out warning:', error.message);
  } finally {
    clearStoredUser();
    window.location.href = getAppPath('/login.html');
  }
}

/**
 * Route protection guard for dashboard and profile pages
 * @param {string|null} expectedRole - 'student', 'provider', or null for any authenticated user
 * @param {Function} onAuthenticated - Callback with user profile data
 */
export function requireAuth(expectedRole = null, onAuthenticated) {
  const cachedUser = getStoredUser();

  // If Firebase is configured, observe auth state
  if (auth && isFirebaseConfigured) {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Not authenticated
        clearStoredUser();
        window.location.href = getAppPath('/login.html');
        return;
      }

      try {
        // Fetch fresh profile from Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);

        let profileData = null;
        if (userSnap.exists()) {
          profileData = userSnap.data();
        } else if (cachedUser && cachedUser.uid === user.uid) {
          profileData = cachedUser;
        } else {
          // Attempt fetch via backend API
          const response = await fetch(`/api/auth/profile/${user.uid}`);
          if (response.ok) {
            const result = await response.json();
            profileData = result.data;
          }
        }

        if (!profileData) {
          clearStoredUser();
          window.location.href = getAppPath('/login.html');
          return;
        }

        setStoredUser(profileData);

        // Verify role
        if (expectedRole && profileData.role !== expectedRole) {
          console.warn(`Role mismatch: Expected ${expectedRole}, got ${profileData.role}`);
          if (profileData.role === 'student') {
            window.location.href = getAppPath('/student/dashboard.html');
          } else {
            window.location.href = getAppPath('/provider/dashboard.html');
          }
          return;
        }

        if (typeof onAuthenticated === 'function') {
          onAuthenticated(profileData);
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
        // Fall back to cached user if available
        if (cachedUser && (!expectedRole || cachedUser.role === expectedRole)) {
          if (typeof onAuthenticated === 'function') onAuthenticated(cachedUser);
        } else {
          window.location.href = getAppPath('/login.html');
        }
      }
    });
  } else {
    // Prototype mode: Check local storage session
    if (!cachedUser) {
      window.location.href = getAppPath('/login.html');
      return;
    }

    if (expectedRole && cachedUser.role !== expectedRole) {
      if (cachedUser.role === 'student') {
        window.location.href = getAppPath('/student/dashboard.html');
      } else {
        window.location.href = getAppPath('/provider/dashboard.html');
      }
      return;
    }

    if (typeof onAuthenticated === 'function') {
      onAuthenticated(cachedUser);
    }
  }
}
