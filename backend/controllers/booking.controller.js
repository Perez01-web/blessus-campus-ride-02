/**
 * Booking Controller
 * 
 * Handles incoming HTTP requests for ride bookings.
 */

import bookingService from '../services/booking.service.js';

class BookingController {
  /**
   * Create a new booking
   * POST /api/bookings
   */
  async create(req, res) {
    try {
      const {
        studentId,
        studentName,
        studentPhone,
        providerId,
        providerName,
        providerType,
        providerPhone,
        vehicleName,
        vehicleRegistration,
        pickupLocation,
        destination,
        fare,
        paymentMethod,
        notes,
      } = req.body;

      if (!studentId || !providerId || !pickupLocation || !destination) {
        return res.status(400).json({
          success: false,
          message: 'Missing required booking fields (studentId, providerId, pickupLocation, destination).',
        });
      }

      const booking = await bookingService.createBooking({
        studentId,
        studentName,
        studentPhone,
        providerId,
        providerName,
        providerType,
        providerPhone,
        vehicleName,
        vehicleRegistration,
        pickupLocation,
        destination,
        fare,
        paymentMethod,
        notes,
      });

      return res.status(201).json({
        success: true,
        message: 'Ride booked successfully!',
        data: booking,
      });
    } catch (error) {
      console.error('[Booking Controller] create error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to create booking: ' + error.message,
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
        return res.status(400).json({ success: false, message: 'Student ID required' });
      }

      const bookings = await bookingService.getStudentBookings(studentId);
      return res.status(200).json({
        success: true,
        count: bookings.length,
        data: bookings,
      });
    } catch (error) {
      console.error('[Booking Controller] getStudentBookings error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to load student bookings',
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
        return res.status(400).json({ success: false, message: 'Provider ID required' });
      }

      const bookings = await bookingService.getProviderBookings(providerId);
      return res.status(200).json({
        success: true,
        count: bookings.length,
        data: bookings,
      });
    } catch (error) {
      console.error('[Booking Controller] getProviderBookings error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to load provider bookings',
      });
    }
  }

  /**
   * Get single booking details
   * GET /api/bookings/:bookingId
   */
  async getBooking(req, res) {
    try {
      const { bookingId } = req.params;
      const booking = await bookingService.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }

      return res.status(200).json({
        success: true,
        data: booking,
      });
    } catch (error) {
      console.error('[Booking Controller] getBooking error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch booking details',
      });
    }
  }

  /**
   * Update booking status
   * PATCH /api/bookings/:bookingId/status
   */
  async updateStatus(req, res) {
    try {
      const { bookingId } = req.params;
      const { status, note } = req.body;

      const validStatuses = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const updated = await bookingService.updateStatus(bookingId, status, { note });
      return res.status(200).json({
        success: true,
        message: `Booking status updated to ${status}`,
        data: updated,
      });
    } catch (error) {
      console.error('[Booking Controller] updateStatus error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to update booking status: ' + error.message,
      });
    }
  }
}

export default new BookingController();
