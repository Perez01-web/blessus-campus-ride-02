/**
 * Student Bookings Controller
 * 
 * Retrieves, filters, and manages ride requests for the logged-in student.
 */

import { requireAuth, logoutUser } from '../auth.js';
import { api } from '../api.js';
import { firestoreService } from '../firestore-service.js';
import { formatMWK } from '../utils.js';

let currentStudent = null;
let cachedBookings = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('student', (user) => {
    currentStudent = user;
    loadBookings();
  });

  // Filter Buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.status || 'all';
      filterAndRenderBookings();
    });
  });

  // Refresh
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadBookings();
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
  }
});

async function loadBookings() {
  if (!currentStudent) return;

  const loadingState = document.getElementById('loadingState');
  const bookingsList = document.getElementById('bookingsList');
  const emptyState = document.getElementById('emptyState');
  const alertBox = document.getElementById('alertBox');

  if (loadingState) loadingState.style.display = 'block';
  if (bookingsList) bookingsList.style.display = 'none';
  if (emptyState) emptyState.style.display = 'none';
  if (alertBox) {
    alertBox.className = 'alert hidden';
    alertBox.textContent = '';
  }

  try {
    let bookings = [];

    // 1. Try Backend API first for immediate consistency
    try {
      bookings = await api.getStudentBookings(currentStudent.uid);
    } catch (apiErr) {
      console.warn('[Student Bookings] API failed, trying Firestore:', apiErr);
      bookings = await firestoreService.getStudentBookings(currentStudent.uid);
    }

    if (!bookings || bookings.length === 0) {
      try {
        const fsBookings = await firestoreService.getStudentBookings(currentStudent.uid);
        if (fsBookings && fsBookings.length > 0) bookings = fsBookings;
      } catch (e) {
        // ignore
      }
    }

    cachedBookings = bookings || [];
    updateStats(cachedBookings);
    filterAndRenderBookings();
  } catch (err) {
    console.error('[Student Bookings Error]:', err);
    if (loadingState) loadingState.style.display = 'none';
    if (alertBox) {
      alertBox.className = 'alert alert-danger';
      alertBox.textContent = `Could not load bookings: ${err.message || 'Please retry.'}`;
    }
  }
}

function updateStats(bookings) {
  const totalEl = document.getElementById('statTotalBookings');
  const activeEl = document.getElementById('statActiveBookings');
  const completedEl = document.getElementById('statCompletedBookings');

  const total = bookings.length;
  const active = bookings.filter(b => b.status === 'pending' || b.status === 'accepted' || b.status === 'in_progress').length;
  const completed = bookings.filter(b => b.status === 'completed').length;

  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active;
  if (completedEl) completedEl.textContent = completed;
}

function filterAndRenderBookings() {
  const loadingState = document.getElementById('loadingState');
  const bookingsList = document.getElementById('bookingsList');
  const emptyState = document.getElementById('emptyState');

  if (loadingState) loadingState.style.display = 'none';

  let list = cachedBookings;
  if (currentFilter === 'active') {
    list = list.filter(b => b.status === 'pending' || b.status === 'accepted' || b.status === 'in_progress');
  } else if (currentFilter === 'completed') {
    list = list.filter(b => b.status === 'completed');
  } else if (currentFilter === 'cancelled') {
    list = list.filter(b => b.status === 'cancelled');
  }

  if (list.length === 0) {
    if (bookingsList) bookingsList.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (bookingsList) {
    bookingsList.style.display = 'block';
    bookingsList.innerHTML = list.map(b => createBookingCardHtml(b)).join('');

    // Attach cancel listeners
    bookingsList.querySelectorAll('.btn-cancel-ride').forEach(btn => {
      btn.addEventListener('click', async () => {
        const bId = btn.dataset.bookingId;
        if (!confirm('Are you sure you want to cancel this ride request?')) return;

        btn.disabled = true;
        btn.textContent = 'Cancelling...';

        try {
          await api.updateBookingStatus(bId, 'cancelled', 'Cancelled by student');
          try {
            await firestoreService.updateBookingStatus(bId, 'cancelled');
          } catch (e) { /* ignore */ }

          // Update local cache
          const b = cachedBookings.find(x => x.bookingId === bId);
          if (b) b.status = 'cancelled';
          updateStats(cachedBookings);
          filterAndRenderBookings();
        } catch (err) {
          alert('Failed to cancel ride: ' + err.message);
          btn.disabled = false;
          btn.textContent = 'Cancel Ride';
        }
      });
    });
  }
}

function createBookingCardHtml(booking) {
  const isTaxi = booking.providerType === 'taxi';
  const typeEmoji = isTaxi ? '🚕' : '🏍️';
  const typeLabel = isTaxi ? 'Campus Taxi' : 'Campus Motorbike';
  const fareFormatted = formatMWK(booking.fare || 0);

  const status = booking.status || 'pending';
  let statusText = 'Pending Confirmation';
  if (status === 'accepted') statusText = 'Driver Accepted';
  if (status === 'in_progress') statusText = 'Trip In Progress';
  if (status === 'completed') statusText = 'Ride Completed';
  if (status === 'cancelled') statusText = 'Cancelled';

  const dateObj = new Date(booking.createdAt || Date.now());
  const dateFormatted = dateObj.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const paymentMethodLabel = booking.paymentMethod === 'airtel_money' 
    ? '📱 Airtel Money' 
    : (booking.paymentMethod === 'mpamba' ? '📲 TNM Mpamba' : '💵 Cash on arrival');

  const cleanPhone = (booking.providerPhone || '').replace(/\s+/g, '');
  const canCancel = status === 'pending' || status === 'accepted';

  return `
    <div class="booking-card" id="booking-${escapeHtml(booking.bookingId)}">
      <div class="booking-header">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div class="provider-avatar ${isTaxi ? 'taxi' : 'motorbike'}" style="width: 44px; height: 44px; font-size: 1.3rem;">
            ${typeEmoji}
          </div>
          <div>
            <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: #0f172a;">
              ${escapeHtml(booking.providerName || 'Driver')}
            </h3>
            <span style="font-size: 0.8rem; color: #64748b;">
              ${typeLabel} • ${escapeHtml(booking.vehicleName || 'Vehicle')} (${escapeHtml(booking.vehicleRegistration || 'Plate')})
            </span>
          </div>
        </div>

        <span class="status-badge ${status}">
          ${statusText}
        </span>
      </div>

      <!-- Route box -->
      <div class="booking-route">
        <div class="route-point">
          <span class="point-dot pickup"></span>
          <span><strong>Pickup:</strong> ${escapeHtml(booking.pickupLocation || 'Main Gate')}</span>
        </div>
        <div class="route-point">
          <span class="point-dot dest"></span>
          <span><strong>Destination:</strong> ${escapeHtml(booking.destination || 'Destination')}</span>
        </div>
      </div>

      ${booking.notes ? `
        <div style="font-size: 0.83rem; color: #475569; background: #fffbeb; padding: 0.4rem 0.65rem; border-radius: 4px; border-left: 3px solid #f59e0b;">
          <strong>Notes:</strong> ${escapeHtml(booking.notes)}
        </div>
      ` : ''}

      <!-- Meta Row -->
      <div class="booking-meta-row">
        <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <div>
            <span style="font-size: 0.75rem; color: #64748b; display: block;">Total Fare</span>
            <span style="font-size: 1.15rem; font-weight: 800; color: #d97706;">${fareFormatted}</span>
          </div>
          <span style="font-size: 0.8rem; background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 4px; color: #475569;">
            ${paymentMethodLabel}
          </span>
          <span style="font-size: 0.8rem; color: #94a3b8;">
            🕒 ${dateFormatted}
          </span>
        </div>

        <div class="booking-actions">
          ${cleanPhone ? `
            <a href="tel:${escapeHtml(cleanPhone)}" class="btn btn-sm btn-secondary" title="Call Driver" style="display: inline-flex; align-items: center; gap: 0.35rem;">
              📞 Call Driver
            </a>
          ` : ''}
          ${canCancel ? `
            <button type="button" class="btn btn-sm btn-outline-danger btn-cancel-ride" data-booking-id="${escapeHtml(booking.bookingId)}">
              Cancel Ride
            </button>
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
