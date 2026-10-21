import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import authRoutes from './backend/routes/auth.routes.js';
import providerRoutes from './backend/routes/provider.routes.js';
import bookingRoutes from './backend/routes/booking.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, './frontend');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. API routes
app.use('/api/auth', authRoutes);
app.use('/api/provider', providerRoutes);
app.use('/api/bookings', bookingRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Transport Booking App Backend',
    timestamp: new Date().toISOString(),
  });
});

// 2. Serve frontend static assets
app.use(express.static(frontendDir));
app.use('/frontend', express.static(frontendDir));

// Fallback for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e: any) {
      console.warn('Vite middleware notice:', e?.message || e);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(` Transport Booking App - Server Started `);
    console.log(` Port: ${PORT}`);
    console.log(`=========================================`);
  });
}

start();
