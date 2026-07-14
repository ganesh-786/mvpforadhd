import multer from 'multer';
import { AppError } from '../lib/errors.js';

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Audio segment exceeds the 25MB limit.');
      return;
    }
    sendError(res, 400, 'BAD_AUDIO', err.message);
    return;
  }
  if (err.message === 'BAD_AUDIO') {
    sendError(res, 400, 'BAD_AUDIO', 'Unsupported audio format.');
    return;
  }
  console.error(err);
  sendError(res, 500, 'UPSTREAM_ERROR', 'Unexpected server error.');
}
