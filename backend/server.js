/**
 * Backend Server Entry Point
 * 
 * Starts Express, configures middleware, registers routes,
 * serves frontend static assets, and listens on the configured PORT.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes.js';
import providerRoutes from './routes/provider.routes.js';
import bookingRoutes from './routes/booking.routes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Resolve paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');

// 1. Core Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 3. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/provider', providerRoutes);
app.use('/api/bookings', bookingRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Transport Booking App Backend',
    module: 'MVP 1 - Foundation & Authentication',
    timestamp: new Date().toISOString(),
  });
});

// 4. Serve Frontend Static Assets
app.use(express.static(frontendDir));
app.use('/frontend', express.static(frontendDir));

// Fallback for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// 5. Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(` Transport Booking App - Server Started `);
  console.log(` Port: ${PORT}`);
  console.log(` Frontend URL: http://localhost:${PORT}`);
  console.log(` Health Check: http://localhost:${PORT}/api/health`);
  console.log(`=========================================`);
});
