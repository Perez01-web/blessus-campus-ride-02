/**
 * Auth Routes
 * 
 * Maps authentication and profile endpoints to the auth controller.
 */

import express from 'express';
import authController from '../controllers/auth.controller.js';

const router = express.Router();

// Register or synchronize user profile document
router.post('/register-profile', authController.registerProfile);

// Login user by email
router.post('/login', authController.login);

// Fetch user profile by UID
router.get('/profile/:uid', authController.getProfile);

export default router;
