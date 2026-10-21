/**
 * Booking Routes
 * 
 * Maps booking endpoints to the booking controller.
 */

import express from 'express';
import bookingController from '../controllers/booking.controller.js';

const router = express.Router();

// Create new ride booking
router.post('/', bookingController.create);

// Get student bookings
router.get('/student/:studentId', bookingController.getStudentBookings);

// Get provider bookings
router.get('/provider/:providerId', bookingController.getProviderBookings);

// Get single booking
router.get('/:bookingId', bookingController.getBooking);

// Update booking status
router.patch('/:bookingId/status', bookingController.updateStatus);

export default router;
