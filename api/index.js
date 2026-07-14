// Vercel serverless entry point. Reuses the same Express app as local dev
// (server/src/app.js) — do not duplicate route/middleware logic here.
// server/src/index.js (app.listen + predev port-freeing) is for local dev
// only and is never invoked on Vercel.
import { createApp } from '../server/src/app.js';

export default createApp();
