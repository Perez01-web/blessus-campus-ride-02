/**
 * Auth Controller
 * 
 * Handles incoming authentication and user profile requests.
 */

import userService from '../services/user.service.js';
import providerService from '../services/provider.service.js';

class AuthController {
  /**
   * Save or sync user profile after Firebase Auth registration
   * POST /api/auth/register-profile
   */
  async registerProfile(req, res) {
    try {
      const { uid, name, email, phone, role, providerType } = req.body;

      if (!uid || !name || !email || !role) {
        return res.status(400).json({
          success: false,
          message: 'Missing required profile fields (uid, name, email, role).',
        });
      }

      if (role !== 'student' && role !== 'provider') {
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be either "student" or "provider".',
        });
      }

      if (role === 'provider' && !['taxi', 'motorbike'].includes(providerType)) {
        return res.status(400).json({
          success: false,
          message: 'Providers must specify providerType as "taxi" or "motorbike".',
        });
      }

      // 1. Create user document in users collection
      const userProfile = await userService.createUserProfile(uid, {
        name,
        email,
        phone,
        role,
        providerType,
      });

      // 2. If provider, initialize basic provider document
      let providerProfile = null;
      if (role === 'provider') {
        providerProfile = await providerService.createProviderProfile(uid, {
          userId: uid,
          name,
          providerType,
          phone,
          vehicleName: '',
          vehicleRegistration: '',
          price: 0,
          estimatedWaitTime: 10,
          available: true,
        });
      }

      return res.status(201).json({
        success: true,
        message: 'User profile registered successfully.',
        data: {
          user: userProfile,
          provider: providerProfile,
        },
      });
    } catch (error) {
      console.error('[Auth Controller Error] registerProfile:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Something went wrong while saving the profile.',
      });
    }
  }

  /**
   * Get user profile by UID
   * GET /api/auth/profile/:uid
   */
  async getProfile(req, res) {
    try {
      const { uid } = req.params;

      if (!uid) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required.',
        });
      }

      const profile = await userService.getUserProfile(uid);

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      console.error('[Auth Controller Error] getProfile:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve user profile.',
      });
    }
  }

  /**
   * Login user by email
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required.',
        });
      }

      const user = await userService.getUserByEmail(email);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'No account found with this email.',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        data: user,
      });
    } catch (error) {
      console.error('[Auth Controller Error] login:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to process login.',
      });
    }
  }
}

export default new AuthController();
