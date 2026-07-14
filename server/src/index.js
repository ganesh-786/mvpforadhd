import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 8787);

let app;
try {
  app = createApp();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const server = app.listen(port, () => {
  console.log(`taskflow-server listening on http://localhost:${port}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[taskflow-server] Port ${port} is already in use. Stop whatever is using it, or set PORT to a different value in server/.env.`);
  } else {
    console.error('[taskflow-server] Failed to start:', err.message);
  }
  process.exit(1);
});

function shutdown(signal) {
  console.log(`[taskflow-server] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  // don't hang forever if a connection refuses to close
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
