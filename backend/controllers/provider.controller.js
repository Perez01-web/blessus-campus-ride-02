/**
 * Provider Controller
 * 
 * Handles incoming requests for provider profiles and settings.
 */

import providerService from '../services/provider.service.js';
import userService from '../services/user.service.js';

class ProviderController {
  /**
   * Get provider profile
   * GET /api/provider/profile/:providerId
   */
  async getProfile(req, res) {
    try {
      const { providerId } = req.params;

      if (!providerId) {
        return res.status(400).json({
          success: false,
          message: 'Provider ID is required.',
        });
      }

      const profile = await providerService.getProviderProfile(providerId);

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: 'Provider profile not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      console.error('[Provider Controller Error] getProfile:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve provider profile.',
      });
    }
  }

  /**
   * Update provider profile
   * PUT /api/provider/profile/:providerId
   */
  async updateProfile(req, res) {
    try {
      const { providerId } = req.params;
      const updateData = req.body;

      if (!providerId) {
        return res.status(400).json({
          success: false,
          message: 'Provider ID is required.',
        });
      }

      // The auth middleware guarantees req.user is set; the caller may only
      // ever update their own provider profile.
      if (!req.user || req.user.uid !== providerId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized. You can only update your own provider profile.',
        });
      }

      // Update provider document in Firestore
      const updatedProfile = await providerService.updateProviderProfile(providerId, updateData);

      // Keep user doc name & phone in sync if provided
      if (updateData.name || updateData.phone) {
        await userService.createUserProfile(providerId, {
          name: updateData.name,
          phone: updateData.phone,
          role: 'provider',
          providerType: updateData.providerType,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Provider profile updated successfully.',
        data: updatedProfile,
      });
    } catch (error) {
      console.error('[Provider Controller Error] updateProfile:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to update provider profile.',
      });
    }
  }

  /**
   * Get list of available providers
   * GET /api/provider/all or GET /api/provider?type=taxi
   */
  async getAllProviders(req, res) {
    try {
      const { type } = req.query;
      const providers = await providerService.getAvailableProviders({ providerType: type });
      return res.status(200).json({
        success: true,
        count: providers.length,
        data: providers,
      });
    } catch (error) {
      console.error('[Provider Controller Error] getAllProviders:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch available providers.',
      });
    }
  }
}

export default new ProviderController();
