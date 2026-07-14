// Frees the dev server's port before nodemon starts, so a stale process left
// running in another terminal (the recurring EADDRINUSE cause) doesn't block
// startup. Linux/macOS use lsof; Windows uses netstat + taskkill.
import 'dotenv/config';
import { execSync } from 'node:child_process';

const port = Number(process.env.PORT || 8787);
const isWindows = process.platform === 'win32';

function findPids() {
  try {
    if (isWindows) {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      return [...new Set(out.split('\n').map((line) => line.trim().split(/\s+/).pop()).filter(Boolean))];
    }
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return []; // lsof/findstr exit non-zero when nothing matches — that's fine
  }
}

const pids = findPids();
if (pids.length === 0) {
  process.exit(0);
}

console.log(`[free-port] port ${port} is held by pid(s) ${pids.join(', ')} — stopping so dev server can bind`);
for (const pid of pids) {
  try {
    execSync(isWindows ? `taskkill /PID ${pid} /F` : `kill ${pid}`);
  } catch {
    // process may have already exited between the lookup and the kill — ignore
  }
}
