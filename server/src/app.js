import express from 'express';
import cors from 'cors';
import { transcribeRouter } from './routes/transcribe.js';
import { preferencesRouter } from './routes/preferences.js';
import { chunkRouter } from './routes/chunk.js';
import { authRouter } from './routes/auth.js';
import { scheduleRouter } from './routes/schedule.js';
import { googleRouter } from './routes/google.js';
import { googleImportRouter } from './routes/googleImport.js';
import { errorHandler } from './middleware/errorHandler.js';
import { validateEnv } from './lib/validateEnv.js';

export function createApp() {
  validateEnv();

  const app = express();

  app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', transcribeRouter);
  app.use('/api', preferencesRouter);
  app.use('/api', chunkRouter);
  app.use('/api', authRouter);
  app.use('/api', scheduleRouter);
  app.use('/api', googleRouter);
  app.use('/api', googleImportRouter);

  app.use(errorHandler);

  return app;
}
