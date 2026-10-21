/**
 * Provider Dashboard Controller
 *
 * Manages provider dashboard statistics, vehicle type, pricing, availability status,
 * the "My Schedule" panel (availability toggle, "back at" timer, next job) and the
 * live ride request feed that reflects bookings made by students.
 */

import { requireAuth, logoutUser } from './auth.js';
import { db, isFirebaseConfigured } from './firebase-config.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {
  subscribeToProviderBookings,
  updateBookingStatus,
  BOOKING_STATUS,
} from './bookings-service.js';
import { formatMWK } from './utils.js';

let providerUid = null;
let providerData = null;
let providerDocExists = false;
let bookingsUnsubscribe = null;
let allBookings = [];
let activeFilter = 'all';
let countdownTimer = null;
let restoreInFlight = false;
let priceDraft = 0;

const PRICE_STEP = 100;

/**
 * Two pickup times closer than this are treated as clashing.
 */
const OVERLAP_WINDOW_MS = 30 * 60 * 1000;

const EMPTY_STATE_COPY = {
  all: {
    title: 'No ride requests yet',
    desc: 'When a student books you, the request appears here instantly with the pickup time they chose.',
  },
  upcoming: {
    title: 'Nothing upcoming',
    desc: 'Accepted and pending rides with a pickup time in the future will show up here.',
  },
  today: {
    title: 'Nothing scheduled for today',
    desc: 'Rides scheduled for today will show up here once a student books you.',
  },
  closed: {
    title: 'No closed requests',
    desc: 'Completed, declined and cancelled requests will be kept here for your records.',
  },
};

document.addEventListener('DOMContentLoaded', () => {
  // Guard page: Require 'provider' role
  requireAuth('provider', async (user) => {
    providerUid = user.uid;

    // 1. Render Basic User Details
    const providerNameEl = document.getElementById('providerName');
    const providerTypeEl = document.getElementById('providerType');
    const providerPriceEl = document.getElementById('providerPrice');
    const providerWaitTimeEl = document.getElementById('providerWaitTime');
    const providerVehicleEl = document.getElementById('providerVehicle');

    if (providerNameEl) providerNameEl.textContent = user.name || 'Provider';

    const pType = user.providerType || 'taxi';
    if (providerTypeEl) {
      providerTypeEl.textContent = pType === 'taxi' ? 'Taxi Driver' : 'Motorbike Owner';
    }

    // 2. Load Provider Profile Document from Firestore or Backend
    if (db && isFirebaseConfigured) {
      try {
        const providerSnap = await getDoc(doc(db, 'providers', user.uid));
        if (providerSnap.exists()) {
          providerData = providerSnap.data();
          providerDocExists = true;
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
    const vehicleName = providerData && providerData.vehicleName ? providerData.vehicleName : 'Vehicle not registered';
    priceDraft = Number(price) || 0;

    if (providerPriceEl) {
      providerPriceEl.textContent = formatMWK(priceDraft);
    }
    updatePriceStepUI();
    if (providerWaitTimeEl) providerWaitTimeEl.textContent = `${waitTime} minutes`;
    if (providerVehicleEl) providerVehicleEl.textContent = vehicleName;

    // 3. Render the My Schedule panel (availability + back at + next up)
    renderAvailability();
    renderNextUp();
    startAvailabilityCountdown();

    // 4. Start the live ride request feed
    startBookingsSubscription();
  });

  // My Schedule now scrolls to the schedule panel on the dashboard
  const myScheduleBtn = document.getElementById('myScheduleBtn');
  if (myScheduleBtn) {
    myScheduleBtn.addEventListener('click', () => {
      const section = document.getElementById('scheduleSection');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // My Bookings now scrolls to the live ride request feed
  const myBookingsBtn = document.getElementById('myBookingsBtn');
  if (myBookingsBtn) {
    myBookingsBtn.addEventListener('click', () => {
      const section = document.getElementById('bookingsSection');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  // Inline price stepper (Standard Price stat card)
  const priceDecBtn = document.getElementById('priceDecBtn');
  if (priceDecBtn) {
    priceDecBtn.addEventListener('click', () => stepPrice(-PRICE_STEP));
  }

  const priceIncBtn = document.getElementById('priceIncBtn');
  if (priceIncBtn) {
    priceIncBtn.addEventListener('click', () => stepPrice(PRICE_STEP));
  }

  const priceSaveBtn = document.getElementById('priceSaveBtn');
  if (priceSaveBtn) {
    priceSaveBtn.addEventListener('click', savePrice);
  }

  // Availability controls
  const availabilityToggle = document.getElementById('availabilityToggle');
  if (availabilityToggle) {
    availabilityToggle.addEventListener('change', (e) => {
      handleAvailabilityToggle(e.target.checked);
    });
  }

  const applyBackAtBtn = document.getElementById('applyBackAtBtn');
  if (applyBackAtBtn) {
    applyBackAtBtn.addEventListener('click', handleSetBackAt);
  }

  const clearBackAtBtn = document.getElementById('clearBackAtBtn');
  if (clearBackAtBtn) {
    clearBackAtBtn.addEventListener('click', handleClearBackAt);
  }

  // Ride request filter tabs
  const filterBar = document.querySelector('.booking-filter-bar');
  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-booking-filter]');
      if (!btn) return;
      setBookingFilter(btn.dataset.bookingFilter);
    });
  }

  // Ride request action buttons (delegated - list is re-rendered on updates)
  const bookingsList = document.getElementById('bookingsList');
  if (bookingsList) {
    bookingsList.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-booking-action]');
      if (!actionBtn) return;

      const bookingId = actionBtn.dataset.bookingId;
      const action = actionBtn.dataset.bookingAction;

      if (action === 'accept') {
        handleBookingAction(bookingId, BOOKING_STATUS.ACCEPTED);
      } else if (action === 'reject') {
        handleBookingAction(bookingId, BOOKING_STATUS.REJECTED);
      } else if (action === 'complete') {
        handleBookingAction(bookingId, BOOKING_STATUS.COMPLETED);
      }
    });
  }

  // Next up card action buttons (delegated - content is re-rendered on updates)
  const nextUpContent = document.getElementById('nextUpContent');
  if (nextUpContent) {
    nextUpContent.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-booking-action]');
      if (!actionBtn) return;
      handleBookingAction(actionBtn.dataset.bookingId, BOOKING_STATUS.ACCEPTED);
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

/* ------------------------------------------------------------------ *
 * My Schedule — availability
 * ------------------------------------------------------------------ */

/**
 * Work out the provider's effective availability.
 * - 'available' : visible to students right now
 * - 'paused'    : hidden, but automatically back at `availableUntil`
 * - 'off'       : hidden with no automatic return
 */
function getAvailabilityState() {
  const data = providerData || {};
  const until = data.availableUntil || null;
  const untilMs = until ? new Date(until).getTime() : NaN;
  const hasValidUntil = !Number.isNaN(untilMs);

  if (data.available !== false) {
    return { mode: 'available', until: null, untilMs: NaN };
  }
  if (hasValidUntil && untilMs > Date.now()) {
    return { mode: 'paused', until, untilMs };
  }
  return { mode: 'off', until: null, untilMs: NaN };
}

/**
 * Render the availability card (toggle, labels, countdown, status pill).
 */
function renderAvailability() {
  const toggle = document.getElementById('availabilityToggle');
  const stateEl = document.getElementById('availabilityState');
  const substateEl = document.getElementById('availabilitySubstate');
  const countdownEl = document.getElementById('availabilityCountdown');
  const input = document.getElementById('backAtTime');
  const pill = document.getElementById('providerStatusPill');

  const state = getAvailabilityState();

  if (toggle) {
    toggle.checked = state.mode === 'available';
    toggle.disabled = !providerDocExists;
  }

  if (stateEl) {
    if (state.mode === 'available') stateEl.textContent = 'Taking rides';
    else if (state.mode === 'paused') stateEl.textContent = `Unavailable until ${formatClock(state.until)}`;
    else stateEl.textContent = 'Not taking rides';
  }

  if (substateEl) {
    if (!providerDocExists) {
      substateEl.textContent = 'Complete your provider profile to manage availability';
    } else if (state.mode === 'available') {
      substateEl.textContent = 'Students can find and book you';
    } else if (state.mode === 'paused') {
      substateEl.textContent = `Students see you as away until ${formatClock(state.until)}`;
    } else {
      substateEl.textContent = 'You are hidden from student search';
    }
  }

  if (countdownEl) {
    if (state.mode === 'paused') {
      countdownEl.className = 'availability-countdown is-active';
      countdownEl.textContent = `Back online in ${formatDuration(state.untilMs - Date.now())}`;
    } else {
      countdownEl.className = 'availability-countdown';
      countdownEl.textContent = '';
    }
  }

  if (input) {
    const untilValue = state.mode === 'paused'
      ? state.until
      : (providerData && providerData.availableUntil ? providerData.availableUntil : null);
    input.value = untilValue ? formatTimeInputValue(untilValue) : '';
  }

  if (pill) {
    if (state.mode === 'available') {
      pill.className = 'status-pill status-available';
      pill.textContent = 'Available for Trips';
    } else {
      pill.className = 'status-pill status-unavailable';
      pill.textContent = state.mode === 'paused' ? `Back at ${formatClock(state.until)}` : 'Unavailable';
    }
  }
}

/**
 * Persist a patch onto the provider's own Firestore document.
 */
async function updateProviderDoc(patch) {
  if (!providerUid) throw new Error('You are not signed in.');
  if (!db || !isFirebaseConfigured) throw new Error('Firestore is not configured.');
  if (!providerDocExists) throw new Error('Provider profile not found.');

  const payload = {
    ...patch,
    providerId: providerUid,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'providers', providerUid), payload, { merge: true });

  providerData = { ...(providerData || {}), ...payload };
  renderAvailability();
  return providerData;
}

/**
 * Flip the availability switch on or off.
 */
async function handleAvailabilityToggle(isAvailable) {
  const toggle = document.getElementById('availabilityToggle');
  if (toggle) toggle.disabled = true;

  try {
    await updateProviderDoc(
      isAvailable
        ? { available: true, availableUntil: null }
        : { available: false, availableUntil: null }
    );
    showScheduleMessage(
      isAvailable
        ? 'You are live — students can book you again.'
        : 'You are off. Students will not see you in search.',
      'success'
    );
  } catch (error) {
    console.error('[Provider Dashboard] Availability update failed:', error);
    if (toggle) toggle.checked = !isAvailable;
    showScheduleMessage('Could not update your availability. Please try again.', 'danger');
  } finally {
    if (toggle) toggle.disabled = !providerDocExists;
  }
}

/**
 * Hide the provider from search until the chosen time.
 */
async function handleSetBackAt() {
  const input = document.getElementById('backAtTime');
  if (!input) return;

  const iso = resolveBackAtIso(input.value);
  if (!iso) {
    showScheduleMessage('Enter a valid time, for example 15:30.', 'danger');
    return;
  }

  const btn = document.getElementById('applyBackAtBtn');
  if (btn) btn.disabled = true;

  try {
    await updateProviderDoc({ available: false, availableUntil: iso });
    showScheduleMessage(
      `Students see you as "Back at ${formatClock(iso)}". Bookings reopen then.`,
      'success'
    );
  } catch (error) {
    console.error('[Provider Dashboard] Back-at update failed:', error);
    showScheduleMessage('Could not set your return time. Please try again.', 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Clear the "back at" timer and come back online immediately.
 */
async function handleClearBackAt() {
  const btn = document.getElementById('clearBackAtBtn');
  if (btn) btn.disabled = true;

  try {
    await updateProviderDoc({ available: true, availableUntil: null });
    showScheduleMessage('You are back online and visible to students.', 'success');
  } catch (error) {
    console.error('[Provider Dashboard] Could not clear the timer:', error);
    showScheduleMessage('Could not update your status. Please try again.', 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Keep the countdown fresh and flip the provider back online when the time passes.
 */
function startAvailabilityCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tickAvailability, 1000);
}

async function tickAvailability() {
  const state = getAvailabilityState();
  const countdownEl = document.getElementById('availabilityCountdown');

  if (state.mode === 'paused') {
    const remaining = state.untilMs - Date.now();
    if (remaining > 0) {
      if (countdownEl) {
        countdownEl.className = 'availability-countdown is-active';
        countdownEl.textContent = `Back online in ${formatDuration(remaining)}`;
      }
      return;
    }
  }

  await restoreAvailabilityIfElapsed();
}

/**
 * Self-heal: if the "back at" time has passed, come back online automatically.
 */
async function restoreAvailabilityIfElapsed() {
  if (restoreInFlight || !providerData) return;

  const until = providerData.availableUntil;
  if (!until) return;

  const untilMs = new Date(until).getTime();
  if (Number.isNaN(untilMs) || untilMs > Date.now()) return;

  restoreInFlight = true;
  try {
    await updateProviderDoc({ available: true, availableUntil: null });
    showScheduleMessage('You are back online and visible to students.', 'success');
  } catch (error) {
    console.warn('[Provider Dashboard] Auto-restore failed:', error);
  } finally {
    restoreInFlight = false;
  }
}

/**
 * Show a short status message inside the availability card.
 */
function showScheduleMessage(text, tone = 'info') {
  const el = document.getElementById('scheduleMessage');
  if (!el) return;
  el.className = `schedule-message is-${tone}`;
  el.textContent = text;
  if (tone === 'success') {
    setTimeout(() => {
      if (el.textContent === text) {
        el.className = 'schedule-message';
        el.textContent = '';
      }
    }, 4000);
  }
}

/* ------------------------------------------------------------------ *
 * My Schedule — next up
 * ------------------------------------------------------------------ */

/**
 * Find the provider's next job and the next request waiting for a reply.
 */
function computeNextUp(bookings) {
  const now = Date.now();

  const upcoming = bookings
    .filter((b) => b.pickupTime && !Number.isNaN(new Date(b.pickupTime).getTime()))
    .filter((b) => new Date(b.pickupTime).getTime() >= now)
    .sort((a, b) => new Date(a.pickupTime).getTime() - new Date(b.pickupTime).getTime());

  return {
    nextRide: upcoming.find((b) => b.status === BOOKING_STATUS.ACCEPTED) || null,
    nextPending: upcoming.find((b) => b.status === BOOKING_STATUS.PENDING) || null,
  };
}

/**
 * Render the "Next Up" card.
 */
function renderNextUp() {
  const el = document.getElementById('nextUpContent');
  if (!el) return;

  const { nextRide, nextPending } = computeNextUp(allBookings);

  if (nextRide) {
    el.innerHTML = buildNextUpHtml(
      'Next ride',
      nextRide,
      'ride',
      findClash(nextRide, allBookings, [BOOKING_STATUS.PENDING])
    );
    return;
  }

  if (nextPending) {
    el.innerHTML = buildNextUpHtml(
      'Request waiting',
      nextPending,
      'request',
      findClash(nextPending, allBookings, [BOOKING_STATUS.ACCEPTED])
    );
    return;
  }

  el.innerHTML = `
    <div class="next-up-empty">
      <span class="next-up-empty-title">Nothing scheduled</span>
      <span class="next-up-empty-desc">New student requests will show up here.</span>
    </div>
  `;
}

function buildNextUpHtml(label, booking, kind, overlap) {
  const name = escapeHtml(booking.studentName || 'Student');
  const time = escapeHtml(formatPickupTime(booking.pickupTime));
  const fare = Number(booking.fare) || 0;
  const telHref = String(booking.studentPhone || '').replace(/[^\d+]/g, '');
  const bookingId = escapeHtml(booking.id || booking.bookingId || '');

  const action = kind === 'ride'
    ? (telHref.length >= 6
        ? `<a class="btn btn-secondary btn-sm" href="tel:${escapeHtml(telHref)}">Call</a>`
        : `<span class="booking-item-empty-note">No phone number on file</span>`)
    : `<button type="button" class="btn btn-primary btn-sm" data-booking-action="accept" data-booking-id="${bookingId}">Accept</button>`;

  const overlapNote = overlap
    ? (kind === 'ride'
        ? `<div class="next-up-overlap">⚠️ A request at ${escapeHtml(formatOverlapTime(overlap.pickupTime))} clashes with this ride</div>`
        : `<div class="next-up-overlap">⚠️ Clashes with your ride at ${escapeHtml(formatOverlapTime(overlap.pickupTime))}</div>`)
    : '';

  return `
    <div class="next-up-badge">${escapeHtml(label)}</div>
    <div class="next-up-main">
      <div class="next-up-name">${name}</div>
      <div class="next-up-meta">🕒 ${time}</div>
      <div class="next-up-meta">💰 ${fare ? escapeHtml(formatMWK(fare)) : 'Fare on request'}</div>
      ${overlapNote}
    </div>
    <div class="next-up-actions">${action}</div>
  `;
}

/* ------------------------------------------------------------------ *
 * Standard price stepper
 * ------------------------------------------------------------------ */

/**
 * Bump the draft price up or down in 100 MWK steps.
 */
function stepPrice(delta) {
  const next = Math.max(0, priceDraft + delta);
  if (next === priceDraft) return;
  priceDraft = next;
  updatePriceStepUI();
}

/**
 * Reflect the draft price in the stat card and mark it dirty.
 */
function updatePriceStepUI() {
  const valueEl = document.getElementById('providerPrice');
  const saveBtn = document.getElementById('priceSaveBtn');
  const hintEl = document.getElementById('priceStepHint');

  if (valueEl) valueEl.textContent = formatMWK(priceDraft);

  const saved = providerData && providerData.price !== undefined ? Number(providerData.price) || 0 : 0;
  const isDirty = priceDraft !== saved;

  if (saveBtn) {
    saveBtn.disabled = !isDirty;
    saveBtn.textContent = isDirty ? 'Save Price' : 'Saved';
  }

  if (hintEl) {
    hintEl.textContent = isDirty
      ? `Unsaved — ${formatMWK(saved)} is live now`
      : '';
  }
}

/**
 * Persist the draft price onto the provider document.
 */
async function savePrice() {
  const saveBtn = document.getElementById('priceSaveBtn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    await updateProviderDoc({ price: priceDraft });
    showScheduleMessage(`Your price is now ${formatMWK(priceDraft)} per trip.`, 'success');
  } catch (error) {
    console.error('[Provider Dashboard] Price update failed:', error);
    showScheduleMessage('Could not save your price. Please try again.', 'danger');
  } finally {
    updatePriceStepUI();
  }
}

/* ------------------------------------------------------------------ *
 * Ride requests feed + filters
 * ------------------------------------------------------------------ */

/**
 * Subscribe to bookings addressed to this provider and keep the UI in sync.
 */
function startBookingsSubscription() {
  if (!providerUid) return;

  bookingsUnsubscribe = subscribeToProviderBookings(
    providerUid,
    renderBookings,
    (err) => {
      console.error('[Provider Dashboard] Booking feed error:', err.message);
      const list = document.getElementById('bookingsList');
      if (list) list.innerHTML = '';
      const empty = document.getElementById('bookingsEmpty');
      if (empty) {
        empty.style.display = 'block';
        const desc = empty.querySelector('.empty-state-desc');
        if (desc) {
          desc.textContent =
            'Live ride requests could not be loaded. Please refresh the page or check your Firestore security rules.';
        }
      }
    }
  );
}

/**
 * Switch the visible slice of the request list.
 */
function setBookingFilter(filter) {
  activeFilter = filter || 'all';

  const buttons = document.querySelectorAll('[data-booking-filter]');
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.bookingFilter === activeFilter);
  });

  renderBookings(allBookings);
}

/**
 * Narrow the booking list down to the active filter.
 */
function filterBookingsForView(bookings) {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const isOpen = (b) => b.status === BOOKING_STATUS.PENDING || b.status === BOOKING_STATUS.ACCEPTED;
  const timeOf = (b) => (b.pickupTime ? new Date(b.pickupTime).getTime() : NaN);

  switch (activeFilter) {
    case 'upcoming':
      return bookings.filter((b) => isOpen(b) && timeOf(b) >= now);
    case 'today':
      return bookings.filter(
        (b) => isOpen(b) && timeOf(b) >= startOfToday.getTime() && timeOf(b) <= endOfToday.getTime()
      );
    case 'closed':
      return bookings.filter((b) => !isOpen(b));
    default:
      return bookings;
  }
}

/**
 * Render the live ride request list.
 * @param {Array<Object>} bookings
 */
function renderBookings(bookings) {
  const listEl = document.getElementById('bookingsList');
  const emptyEl = document.getElementById('bookingsEmpty');
  const badgeEl = document.getElementById('bookingCountBadge');
  const countEl = document.getElementById('providerRequestsCount');
  const noteEl = document.getElementById('providerRequestsNote');

  allBookings = Array.isArray(bookings) ? bookings : [];

  renderNextUp();

  if (!listEl) return;

  const pendingCount = allBookings.filter((b) => b.status === BOOKING_STATUS.PENDING).length;
  const visible = filterBookingsForView(allBookings);

  // Counters
  if (badgeEl) {
    badgeEl.textContent = String(visible.length);
    badgeEl.classList.toggle('is-zero', visible.length === 0);
  }
  if (countEl) countEl.textContent = String(pendingCount);
  if (noteEl) {
    noteEl.textContent = pendingCount > 0
      ? `${pendingCount} awaiting your response · ${allBookings.length} total`
      : `${allBookings.length} total request${allBookings.length === 1 ? '' : 's'} · none pending`;
  }

  if (visible.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) {
      const copy = EMPTY_STATE_COPY[activeFilter] || EMPTY_STATE_COPY.all;
      const titleEl = emptyEl.querySelector('.empty-state-title');
      const descEl = emptyEl.querySelector('.empty-state-desc');
      if (titleEl) titleEl.textContent = copy.title;
      if (descEl) descEl.textContent = copy.desc;
      emptyEl.style.display = 'block';
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  listEl.innerHTML = visible
    .map((b) =>
      createBookingItemHtml(
        b,
        b.status === BOOKING_STATUS.PENDING
          ? findClash(b, allBookings, [BOOKING_STATUS.ACCEPTED])
          : null
      )
    )
    .join('');
}

/**
 * Look for a clash: another booking of one of the given statuses that lands
 * within the overlap window of the booking being checked.
 * @param {Object} booking - The booking to check
 * @param {Array<Object>} bookings - Every booking for this provider
 * @param {Array<string>} clashStatuses - Statuses that count as a clash
 * @returns {Object|null} The clashing booking, if any
 */
function findClash(booking, bookings, clashStatuses) {
  if (!booking || !booking.pickupTime) return null;

  const time = new Date(booking.pickupTime).getTime();
  if (Number.isNaN(time)) return null;

  for (const other of bookings) {
    if (!other || other.id === booking.id) continue;
    if (!clashStatuses.includes(other.status)) continue;

    const otherTime = new Date(other.pickupTime).getTime();
    if (Number.isNaN(otherTime)) continue;

    if (Math.abs(otherTime - time) <= OVERLAP_WINDOW_MS) {
      return other;
    }
  }

  return null;
}

/**
 * Build the HTML for a single ride request card.
 */
function createBookingItemHtml(booking, overlap) {
  const status = booking.status || BOOKING_STATUS.PENDING;
  const statusLabel = {
    [BOOKING_STATUS.PENDING]: 'Pending',
    [BOOKING_STATUS.ACCEPTED]: 'Accepted',
    [BOOKING_STATUS.REJECTED]: 'Declined',
    [BOOKING_STATUS.COMPLETED]: 'Completed',
    [BOOKING_STATUS.CANCELLED]: 'Cancelled',
  }[status] || status;

  const pickupLabel = formatPickupTime(booking.pickupTime);
  const isPast = booking.pickupTime && new Date(booking.pickupTime).getTime() < Date.now();
  const fare = Number(booking.fare) || 0;

  const studentName = escapeHtml(booking.studentName || 'Student');
  const studentPhone = escapeHtml(booking.studentPhone || '');
  const telHref = String(booking.studentPhone || '').replace(/[^\d+]/g, '');

  const overlapRow = overlap
    ? `<li class="booking-detail-item booking-overlap-warning">
         <span>⚠️</span>
         <strong>Clashes:</strong> you already have a ride at ${escapeHtml(formatOverlapTime(overlap.pickupTime))}
       </li>`
    : '';

  let actions = '';
  if (status === BOOKING_STATUS.PENDING) {
    actions = `
      <button type="button" class="btn btn-primary" data-booking-action="accept" data-booking-id="${escapeHtml(booking.id || booking.bookingId || '')}">
        Accept
      </button>
      <button type="button" class="btn btn-outline-danger" data-booking-action="reject" data-booking-id="${escapeHtml(booking.id || booking.bookingId || '')}">
        Decline
      </button>
      ${telHref.length >= 6 ? `<a class="btn btn-secondary" href="tel:${escapeHtml(telHref)}">Call Student</a>` : ''}
    `;
  } else if (status === BOOKING_STATUS.ACCEPTED) {
    actions = `
      <button type="button" class="btn btn-primary" data-booking-action="complete" data-booking-id="${escapeHtml(booking.id || booking.bookingId || '')}">
        Mark Completed
      </button>
      ${telHref.length >= 6 ? `<a class="btn btn-secondary" href="tel:${escapeHtml(telHref)}">Call Student</a>` : ''}
    `;
  } else {
    actions = `<span class="booking-item-empty-note">This request is closed. No further action needed.</span>`;
  }

  return `
    <div class="booking-item is-${escapeHtml(status)}${overlap ? ' has-overlap' : ''}" data-booking-id="${escapeHtml(booking.id || booking.bookingId || '')}">
      <div class="booking-item-top">
        <h3 class="booking-student-name">${studentName}</h3>
        <span class="booking-status status-${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
      </div>

      <ul class="booking-details-list">
        <li class="booking-detail-item">
          <span>🕒</span>
          <strong>Pickup:</strong> ${escapeHtml(pickupLabel)}
          ${isPast && status !== BOOKING_STATUS.COMPLETED ? '<span class="booking-status status-cancelled">Time passed</span>' : ''}
        </li>
        ${overlapRow}
        <li class="booking-detail-item">
          <span>💰</span>
          <strong>Fare:</strong> ${escapeHtml(fare ? formatMWK(fare) : 'Fare on request')}
        </li>
        <li class="booking-detail-item">
          <span>📞</span>
          <strong>Contact:</strong> ${studentPhone || 'Not provided'}
        </li>
        <li class="booking-detail-item">
          <span>🚕</span>
          <strong>Service:</strong> ${escapeHtml(booking.providerType === 'motorbike' ? 'Motorbike Driver' : 'Taxi Driver')}
          ${booking.vehicleName ? ` — ${escapeHtml(booking.vehicleName)}` : ''}
        </li>
      </ul>

      <div class="booking-item-actions">
        ${actions}
      </div>
    </div>
  `;
}

/**
 * Apply a status change to a booking.
 */
async function handleBookingAction(bookingId, status) {
  if (!bookingId) return;

  try {
    await updateBookingStatus(bookingId, status);
    console.log(`[Provider Dashboard] Booking ${bookingId} set to ${status}`);
  } catch (error) {
    console.error('[Provider Dashboard] Failed to update booking:', error);
    const list = document.getElementById('bookingsList');
    if (list) {
      list.insertAdjacentHTML(
        'afterbegin',
        `<div class="alert alert-danger">Could not update that request. Please try again.</div>`
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

/**
 * Format an ISO timestamp for display.
 */
function formatPickupTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString || '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a timestamp as a compact date + time (e.g. "Wed, 21 Oct, 8:30 PM").
 */
function formatOverlapTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Turn a "HH:MM" input into a full ISO timestamp (tomorrow if the time already passed).
 */
function resolveBackAtIso(timeStr) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }
  return target.toISOString();
}

/**
 * Format a timestamp as a short clock time (e.g. "3:30 PM").
 */
function formatClock(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Format a timestamp as the 24h value an <input type="time"> expects.
 */
function formatTimeInputValue(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format a remaining duration as "1h 12m" or "42 min".
 */
function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} min`;
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
