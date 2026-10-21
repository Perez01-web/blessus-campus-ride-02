/**
 * Utility Helpers
 * 
 * Reusable functions for UI feedback, modals, session caching, and navigation.
 */

// Display alert banner
export function showAlert(containerId, message, type = 'danger') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.className = `alert alert-${type}`;
  container.textContent = message;
  container.classList.remove('hidden');
}

// Hide alert banner
export function hideAlert(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.classList.add('hidden');
    container.textContent = '';
  }
}

// Show Coming Soon Modal Dialog
export function showComingSoonModal(featureName = 'This feature') {
  const overlay = document.getElementById('comingSoonModal');
  const modalText = document.getElementById('modalFeatureText');

  if (overlay) {
    if (modalText) {
      modalText.textContent = `${featureName} will be available in the next module.`;
    }
    overlay.classList.add('active');
  } else {
    alert(`${featureName} is coming in the next module.`);
  }
}

// Close Coming Soon Modal Dialog
export function closeComingSoonModal() {
  const overlay = document.getElementById('comingSoonModal');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// Format currency in Malawi Kwacha (MWK)
export function formatMWK(amount) {
  const num = Number(amount) || 0;
  return `MWK ${num.toLocaleString()}`;
}

// Storage helpers for session persistence
export function getStoredUser() {
  try {
    const data = localStorage.getItem('tb_user');
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

export function setStoredUser(user) {
  try {
    localStorage.setItem('tb_user', JSON.stringify(user));
  } catch (e) {
    console.error('Failed to cache user session:', e);
  }
}

export function clearStoredUser() {
  try {
    localStorage.removeItem('tb_user');
    localStorage.removeItem('tb_token');
  } catch (e) {
    console.error('Failed to clear session:', e);
  }
}

// Helper to determine root-relative path dynamically
export function getAppPath(path) {
  const isInFrontend = window.location.pathname.includes('/frontend/');
  const prefix = isInFrontend ? '/frontend' : '';
  return `${prefix}${path.startsWith('/') ? path : '/' + path}`;
}

// Redirect based on role
export function redirectByRole(role) {
  if (role === 'student') {
    window.location.href = getAppPath('/student/dashboard.html');
  } else if (role === 'provider') {
    window.location.href = getAppPath('/provider/dashboard.html');
  } else {
    window.location.href = getAppPath('/login.html');
  }
}
