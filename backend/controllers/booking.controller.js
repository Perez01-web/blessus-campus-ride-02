/**
 * Booking Controller
 *
 * Handles incoming requests for ride bookings.
 */

import bookingService from '../services/booking.service.js';

// Which status each party is allowed to set on a booking.
const STUDENT_STATUSES = ['cancelled'];
const PROVIDER_STATUSES = ['accepted', 'rejected', 'completed'];

class BookingController {
  /**
   * Create a ride booking
   * POST /api/bookings
   */
  async createBooking(req, res) {
    try {
      const {
        bookingId,
        studentId,
        studentName,
        studentPhone,
        providerId,
        providerName,
        providerPhone,
        providerType,
        vehicleName,
        pickupTime,
        fare,
        estimatedWaitTime,
      } = req.body;

      if (!studentId || !providerId || !pickupTime) {
        return res.status(400).json({
          success: false,
          message: 'Missing required booking fields (studentId, providerId, pickupTime).',
        });
      }

      // A student can only create bookings for themselves.
      if (!req.user || req.user.uid !== studentId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized. You can only create bookings for your own account.',
        });
      }

      const pickupDate = new Date(pickupTime);
      if (Number.isNaN(pickupDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'pickupTime must be a valid date/time.',
        });
      }

      const booking = await bookingService.createBooking({
        bookingId,
        studentId,
        studentName,
        studentPhone,
        providerId,
        providerName,
        providerPhone,
        providerType,
        vehicleName,
        pickupTime: pickupDate.toISOString(),
        fare,
        estimatedWaitTime,
      });

      return res.status(201).json({
        success: true,
        message: 'Booking created successfully.',
        data: booking,
      });
    } catch (error) {
      console.error('[Booking Controller Error] createBooking:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to create the booking.',
      });
    }
  }

  /**
   * Get bookings for a provider
   * GET /api/bookings/provider/:providerId
   */
  async getProviderBookings(req, res) {
    try {
      const { providerId } = req.params;

      if (!providerId) {
        return res.status(400).json({
          success: false,
          message: 'Provider ID is required.',
        });
      }

      // Providers can only read their own bookings.
      if (!req.user || req.user.uid !== providerId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized. You can only view your own ride requests.',
        });
      }

      const bookings = await bookingService.getBookingsByProvider(providerId);

      return res.status(200).json({
        success: true,
        count: bookings.length,
        data: bookings,
      });
    } catch (error) {
      console.error('[Booking Controller Error] getProviderBookings:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve provider bookings.',
      });
    }
  }

  /**
   * Get bookings for a student
   * GET /api/bookings/student/:studentId
   */
  async getStudentBookings(req, res) {
    try {
      const { studentId } = req.params;

      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: 'Student ID is required.',
        });
      }

      // Students can only read their own bookings.
      if (!req.user || req.user.uid !== studentId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized. You can only view your own bookings.',
        });
      }

      const bookings = await bookingService.getBookingsByStudent(studentId);

      return res.status(200).json({
        success: true,
        count: bookings.length,
        data: bookings,
      });
    } catch (error) {
      console.error('[Booking Controller Error] getStudentBookings:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve student bookings.',
      });
    }
  }

  /**
   * Update the status of a booking
   * PUT /api/bookings/:bookingId/status
   */
  async updateBookingStatus(req, res) {
    try {
      const { bookingId } = req.params;
      const { status } = req.body;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required.',
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'A booking status is required.',
        });
      }

      const existing = await bookingService.getBooking(bookingId);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found.',
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      // The student may only cancel; the provider may only move the booking
      // into a final state. Neither party may touch the other one's bookings.
      const isStudent = req.user.uid === existing.studentId;
      const isProvider = req.user.uid === existing.providerId;

      if (isStudent && !STUDENT_STATUSES.includes(status)) {
        return res.status(403).json({
          success: false,
          message: 'Students can only cancel their own booking.',
        });
      }

      if (isProvider && !PROVIDER_STATUSES.includes(status)) {
        return res.status(403).json({
          success: false,
          message: 'Providers can only accept, reject or complete a booking.',
        });
      }

      if (!isStudent && !isProvider) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized. This booking does not belong to you.',
        });
      }

      const updated = await bookingService.updateBookingStatus(bookingId, status);

      return res.status(200).json({
        success: true,
        message: 'Booking status updated successfully.',
        data: updated,
      });
    } catch (error) {
      console.error('[Booking Controller Error] updateBookingStatus:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update the booking.',
      });
    }
  }
}

export default new BookingController();
