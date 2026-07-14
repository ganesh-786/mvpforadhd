import multer from 'multer';

const ALLOWED_MIMETYPES = new Set(['audio/webm', 'audio/wav', 'audio/wave', 'audio/ogg', 'audio/mp4']);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // Groq's own per-file cap
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(new Error('BAD_AUDIO'));
      return;
    }
    cb(null, true);
  },
});
