/**
 * Booking Routes
 *
 * Maps ride booking endpoints to the booking controller.
 */

import express from 'express';
import bookingController from '../controllers/booking.controller.js';
import { verifyAuthToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// Create a booking
router.post('/', verifyAuthToken, bookingController.createBooking);

// Get bookings addressed to a provider
router.get('/provider/:providerId', verifyAuthToken, bookingController.getProviderBookings);

// Get bookings placed by a student
router.get('/student/:studentId', verifyAuthToken, bookingController.getStudentBookings);

// Update the status of a booking
router.put('/:bookingId/status', verifyAuthToken, bookingController.updateBookingStatus);

export default router;
