/**
 * Provider Routes
 * 
 * Maps provider endpoints to the provider controller.
 */

import express from 'express';
import providerController from '../controllers/provider.controller.js';
import { verifyAuthToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// Get all available providers (filtered by ?type=taxi / motorbike)
router.get('/', providerController.getAllProviders);
router.get('/all', providerController.getAllProviders);

// Get provider profile by providerId (public or authenticated)
router.get('/profile/:providerId', providerController.getProfile);

// Update provider profile (protected by auth middleware)
router.put('/profile/:providerId', verifyAuthToken, providerController.updateProfile);

export default router;
