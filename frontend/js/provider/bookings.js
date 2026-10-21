/**
 * Provider Bookings & Dispatch Controller
 * 
 * Manages ride dispatching, accepting/declining student requests,
 * updating ride progress, and calculating driver earnings.
 */

import { requireAuth, logoutUser } from '../auth.js';
import { api } from '../api.js';
import { firestoreService } from '../firestore-service.js';
import { formatMWK } from '../utils.js';

let currentProvider = null;
let cachedBookings = [];
let currentFilter = 'pending';

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('provider', (user) => {
    currentProvider = user;
    loadBookings();
  });

  // Filter Buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.status || 'pending';
      filterAndRenderRequests();
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
  if (!currentProvider) return;

  const loadingState = document.getElementById('loadingState');
  const requestsList = document.getElementById('requestsList');
  const emptyState = document.getElementById('emptyState');
  const alertBox = document.getElementById('alertBox');

  if (loadingState) loadingState.style.display = 'block';
  if (requestsList) requestsList.style.display = 'none';
  if (emptyState) emptyState.style.display = 'none';
  if (alertBox) {
    alertBox.className = 'alert hidden';
    alertBox.textContent = '';
  }

  try {
    let bookings = [];

    // 1. Backend API
    try {
      bookings = await api.getProviderBookings(currentProvider.uid);
    } catch (apiErr) {
      console.warn('[Provider Bookings] API failed, trying Firestore:', apiErr);
      bookings = await firestoreService.getProviderBookings(currentProvider.uid);
    }

    if (!bookings || bookings.length === 0) {
      try {
        const fsBookings = await firestoreService.getProviderBookings(currentProvider.uid);
        if (fsBookings && fsBookings.length > 0) bookings = fsBookings;
      } catch (e) {
        // ignore
      }
    }

    cachedBookings = bookings || [];
    updateMetrics(cachedBookings);
    filterAndRenderRequests();
  } catch (err) {
    console.error('[Provider Bookings Error]:', err);
    if (loadingState) loadingState.style.display = 'none';
    if (alertBox) {
      alertBox.className = 'alert alert-danger';
      alertBox.textContent = `Could not load requests: ${err.message || 'Please retry.'}`;
    }
  }
}

function updateMetrics(bookings) {
  const pendingEl = document.getElementById('statPendingRequests');
  const activeEl = document.getElementById('statActiveTrips');
  const completedEl = document.getElementById('statCompletedTrips');
  const earningsEl = document.getElementById('statTotalEarnings');
  const countPendingBadge = document.getElementById('tabCountPending');
  const countActiveBadge = document.getElementById('tabCountActive');

  const pending = bookings.filter(b => b.status === 'pending');
  const active = bookings.filter(b => b.status === 'accepted' || b.status === 'in_progress');
  const completed = bookings.filter(b => b.status === 'completed');

  const totalEarnings = completed.reduce((sum, b) => sum + (Number(b.fare) || 0), 0);

  if (pendingEl) pendingEl.textContent = pending.length;
  if (activeEl) activeEl.textContent = active.length;
  if (completedEl) completedEl.textContent = completed.length;
  if (earningsEl) earningsEl.textContent = formatMWK(totalEarnings);
  if (countPendingBadge) countPendingBadge.textContent = pending.length;
  if (countActiveBadge) countActiveBadge.textContent = active.length;
}

function filterAndRenderRequests() {
  const loadingState = document.getElementById('loadingState');
  const requestsList = document.getElementById('requestsList');
  const emptyState = document.getElementById('emptyState');

  if (loadingState) loadingState.style.display = 'none';

  let list = cachedBookings;
  if (currentFilter === 'pending') {
    list = list.filter(b => b.status === 'pending');
  } else if (currentFilter === 'active') {
    list = list.filter(b => b.status === 'accepted' || b.status === 'in_progress');
  } else if (currentFilter === 'completed') {
    list = list.filter(b => b.status === 'completed');
  }

  if (list.length === 0) {
    if (requestsList) requestsList.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (requestsList) {
    requestsList.style.display = 'block';
    requestsList.innerHTML = list.map(b => createDispatchCardHtml(b)).join('');

    // Attach Action Listeners
    setupDispatchActions(requestsList);
  }
}

function setupDispatchActions(container) {
  container.querySelectorAll('.btn-dispatch-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bId = btn.dataset.bookingId;
      const targetStatus = btn.dataset.status;
      const actionLabel = btn.textContent.trim();

      btn.disabled = true;
      btn.textContent = 'Updating...';

      try {
        await api.updateBookingStatus(bId, targetStatus, `Provider updated status to ${targetStatus}`);
        try {
          await firestoreService.updateBookingStatus(bId, targetStatus);
        } catch (e) { /* ignore */ }

        // Update local cache
        const booking = cachedBookings.find(x => x.bookingId === bId);
        if (booking) booking.status = targetStatus;

        updateMetrics(cachedBookings);
        filterAndRenderRequests();

      } catch (err) {
        alert(`Failed to ${actionLabel}: ` + err.message);
        btn.disabled = false;
        btn.textContent = actionLabel;
      }
    });
  });
}

function createDispatchCardHtml(booking) {
  const status = booking.status || 'pending';
  const isPending = status === 'pending';
  const isAccepted = status === 'accepted';
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'completed';

  let statusText = 'Pending Request';
  if (isAccepted) statusText = 'Accepted (En Route)';
  if (isInProgress) statusText = 'Trip In Progress';
  if (isCompleted) statusText = 'Completed';
  if (status === 'cancelled') statusText = 'Cancelled';

  const dateObj = new Date(booking.createdAt || Date.now());
  const dateFormatted = dateObj.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const paymentLabel = booking.paymentMethod === 'airtel_money' 
    ? '📱 Airtel Money' 
    : (booking.paymentMethod === 'mpamba' ? '📲 TNM Mpamba' : '💵 Cash on delivery');

  const cleanPhone = (booking.studentPhone || '').replace(/\s+/g, '');
  const bId = escapeHtml(booking.bookingId);

  return `
    <div class="dispatch-card ${isPending ? 'urgent' : ''}" id="dispatch-${bId}">
      <div class="dispatch-header">
        <div class="dispatch-student-info">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: #e0f2fe; color: #0369a1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem;">
            👤
          </div>
          <div>
            <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: #0f172a;">
              ${escapeHtml(booking.studentName || 'Student Rider')}
            </h3>
            <span style="font-size: 0.8rem; color: #64748b;">
              Contact: ${escapeHtml(booking.studentPhone || 'No phone provided')}
            </span>
          </div>
        </div>

        <span class="status-badge ${status}">
          ${statusText}
        </span>
      </div>

      <!-- Route Details -->
      <div class="dispatch-route">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="color: #10b981; font-size: 1rem;">🟢</span>
          <span><strong>Pickup:</strong> ${escapeHtml(booking.pickupLocation || 'Main Gate')}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="color: #ef4444; font-size: 1rem;">🔴</span>
          <span><strong>Destination:</strong> ${escapeHtml(booking.destination || 'Destination')}</span>
        </div>
      </div>

      ${booking.notes ? `
        <div style="font-size: 0.83rem; color: #475569; background: #fffbeb; padding: 0.4rem 0.65rem; border-radius: 4px; border-left: 3px solid #f59e0b;">
          <strong>Student Note:</strong> ${escapeHtml(booking.notes)}
        </div>
      ` : ''}

      <!-- Meta and Action Bar -->
      <div class="dispatch-meta">
        <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <div>
            <span style="font-size: 0.75rem; color: #64748b; display: block;">Trip Fare</span>
            <span style="font-size: 1.15rem; font-weight: 800; color: #d97706;">${formatMWK(booking.fare || 0)}</span>
          </div>
          <span style="font-size: 0.8rem; background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 4px; color: #475569;">
            ${paymentLabel}
          </span>
          <span style="font-size: 0.8rem; color: #94a3b8;">
            🕒 ${dateFormatted}
          </span>
        </div>

        <div class="dispatch-actions">
          ${cleanPhone ? `
            <a href="tel:${escapeHtml(cleanPhone)}" class="btn btn-sm btn-secondary" title="Call Student" style="display: inline-flex; align-items: center; gap: 0.25rem;">
              📞 Call Rider
            </a>
          ` : ''}

          ${isPending ? `
            <button type="button" class="btn btn-sm btn-outline-danger btn-dispatch-action" data-booking-id="${bId}" data-status="cancelled">
              Decline
            </button>
            <button type="button" class="btn btn-sm btn-primary btn-dispatch-action" data-booking-id="${bId}" data-status="accepted">
              Accept Request ✓
            </button>
          ` : ''}

          ${isAccepted ? `
            <button type="button" class="btn btn-sm btn-primary btn-dispatch-action" data-booking-id="${bId}" data-status="in_progress">
              Start Trip 🚗
            </button>
          ` : ''}

          ${isInProgress ? `
            <button type="button" class="btn btn-sm btn-success btn-dispatch-action" data-booking-id="${bId}" data-status="completed" style="background: #16a34a; color: white;">
              Mark Completed 🏁
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
