import { Router } from 'express';
import { upload } from '../middleware/upload.js';
import { transcribeSegment, AppError } from '../lib/groqClient.js';
import { checkAndConsumeQuota } from '../lib/quotaGuard.js';

export const transcribeRouter = Router();

transcribeRouter.post('/transcribe', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('BAD_AUDIO', 'No audio file provided.', 400);
    }

    const quota = checkAndConsumeQuota('transcribe');
    if (!quota.allowed) {
      throw new AppError('RATE_LIMITED', 'Daily transcription quota reached, try again tomorrow.', 429);
    }

    const model = req.body.model || 'whisper-large-v3-turbo';
    const result = await transcribeSegment(req.file.buffer, req.file.originalname || 'segment.webm', model);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
