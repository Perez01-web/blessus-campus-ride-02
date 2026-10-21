/**
 * Student Dashboard Controller
 * 
 * Manages the student dashboard view, auth guards, profile display,
 * action placeholders ("Coming in the next module"), and logout.
 */

import { requireAuth, logoutUser } from './auth.js';
import { showComingSoonModal, closeComingSoonModal } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  // Protect page: require 'student' role
  requireAuth('student', (user) => {
    // Populate user profile info
    const studentNameEl = document.getElementById('studentName');
    const studentEmailEl = document.getElementById('studentEmail');
    const studentPhoneEl = document.getElementById('studentPhone');

    if (studentNameEl) studentNameEl.textContent = user.name || 'Student';
    if (studentEmailEl) studentEmailEl.textContent = user.email || '';
    if (studentPhoneEl) studentPhoneEl.textContent = user.phone || 'Not provided';
  });

  // Action buttons
  const findTransportBtn = document.getElementById('findTransportBtn');
  if (findTransportBtn) {
    findTransportBtn.addEventListener('click', () => {
      window.location.href = './find-transport.html';
    });
  }

  const myBookingsBtn = document.getElementById('myBookingsBtn');
  if (myBookingsBtn) {
    myBookingsBtn.addEventListener('click', () => {
      window.location.href = './bookings.html';
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
