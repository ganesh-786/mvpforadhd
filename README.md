# ADHD TaskFlow

A voice-first "brain-dump to schedule" concept UI, rendered as a React app inside an iPhone 15 Pro mockup frame. Say (or type) a messy list of things you need to do, and the app breaks it into scheduled, bite-sized tasks for the day.

Voice capture is real: the mic is transcribed live via a backend-proxied Groq Whisper API. Task breakdown (turning the transcript into scheduled chunks) is still simulated/static data — that's a future phase.

## Why Groq Whisper, not Gemini

Gemini's real-time voice model (Live API) has no usable free tier for streaming (3 concurrent sessions/key, ~15 min session cap) and costs money per minute even at low volume. Groq's hosted Whisper (`whisper-large-v3-turbo`) is free at this app's scale (2,000 requests/day, ~2 hours of audio per hour of clock time) and needs a much simpler REST integration than Gemini's WebSocket session protocol. See `server/README.md`-equivalent notes below for the security reasoning.

## Stack

- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) — `client/`
- [Express](https://expressjs.com/) proxy holding the Groq API key — `server/`
- npm workspaces monorepo, orchestrated with `concurrently`

## Getting started

```bash
npm install                          # installs client/ + server/ workspaces
cp server/.env.example server/.env   # then fill in GROQ_API_KEY (free: console.groq.com/keys)
npm run dev                          # runs client (:5173) and server (:8787) together
```

Open the printed client URL in a browser, allow microphone access, and talk. Requires a secure context — `localhost` works, a bare LAN IP does not (browsers block `getUserMedia` outside HTTPS/localhost).

## Scripts (root)

| Command        | Description                                          |
| -------------- | ----------------------------------------------------- |
| `npm run dev`   | Run client + server together (`concurrently`)          |
| `npm run build`  | Production build of the client to `client/dist/`        |
| `npm run preview` | Serve the client production build locally               |
| `npm run lint`   | Lint both workspaces                                    |

Each workspace also has its own scripts (`npm run dev -w client`, `npm run dev -w server`, etc.) if you want to run one in isolation.

## Project structure

```
.
├── vercel.json                    # single-project deploy: static client + api/ functions
├── api/
│   └── index.js                    # Vercel serverless entry — wraps server/src/app.js
├── client/                       # React/Vite frontend
│   ├── index.html
│   ├── vite.config.js              # proxies /api/* to the server in dev
│   ├── eslint.config.js
│   ├── .env.example                 # intentionally empty — no client secrets
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                   # phone-frame chrome
│       ├── TaskFlowApp.jsx            # app screens: capture, proposal, home
│       ├── styles.css
│       └── features/voice/
│           ├── useVoiceCapture.js      # mic capture + VAD segmentation hook
│           ├── vad.js                    # silence detection (Web Audio API)
│           └── transcribeClient.js        # calls POST /api/transcribe
└── server/                       # Express app — the only thing holding the Groq key.
    │                                Used directly for local dev (src/index.js listens
    │                                on a port); reused by api/index.js for Vercel.
    ├── .env.example                # GROQ_API_KEY, PORT, CLIENT_ORIGIN, DAILY_QUOTA_LIMIT
    ├── scripts/free-port.mjs        # predev hook: frees a stale process on PORT
    └── src/
        ├── index.js                 # local dev entry (app.listen + graceful shutdown)
        ├── app.js                    # createApp() — the shared Express app
        ├── routes/transcribe.js       # POST /api/transcribe
        ├── middleware/                 # upload (multer), error handling
        └── lib/
            ├── groqClient.js            # calls Groq's Whisper REST endpoint
            └── quotaGuard.js             # per-IP rate limit + daily quota guard
```

## How voice capture works

1. The client records the mic via `MediaRecorder`, watching audio energy (`vad.js`) to detect pauses in speech.
2. Each pause closes a "segment" (a short audio clip) and starts recording the next one, so a long ramble becomes several short clips instead of one long file.
3. Each segment is POSTed to `/api/transcribe` (proxied to the Express server in dev via `vite.config.js`), which forwards it to Groq's Whisper endpoint using the server-side `GROQ_API_KEY` — the key never reaches the browser.
4. The transcribed text for each segment appears as a phrase card in the UI; tapping a phrase and speaking again re-records just that segment.

**Known limitations**: word-by-word live reveal is not possible with segment-based transcription (Whisper returns whole phrases, not a token stream); the built-in silence detector is a simple energy threshold and isn't robust in noisy rooms; Safari's `MediaRecorder` support for opus/webm is inconsistent.

## Security notes

- `GROQ_API_KEY` lives only in `server/.env` locally (or as a Vercel Environment Variable in production), read via `process.env` — never prefix a secret with `VITE_`, since Vite inlines `VITE_*` variables into the public client bundle.
- The proxy is CORS-locked to `CLIENT_ORIGIN` and rate-limited per IP, plus a soft daily quota guard to avoid burning the shared Groq free-tier allowance. The quota counter is in-memory — see the Vercel caveat below for what that means in serverless.
- If this project ever moves to Gemini Live in the future, mint ephemeral tokens server-side with `live_connect_constraints` set — a July 2026 disclosed vulnerability class affects apps that omit this field.

## Deployment

### Single Vercel project (recommended — one deploy, one domain)

The client (static Vite build) and the API (Express app, unchanged) deploy together as one Vercel project. `api/index.js` wraps `server/src/app.js` — the exact same Express app used locally — as a Vercel serverless function; `vercel.json` builds the client to `client/dist/` and rewrites `/api/*` to that function.

1. Push this repo to GitHub/GitLab/Bitbucket and import it in the Vercel dashboard (or run `npx vercel` from the repo root).
2. Leave the **Root Directory** as the repo root (not `client/`) — `vercel.json` already points Vercel at `client/dist` for the build output.
3. In Project Settings → Environment Variables, set:
   - `GROQ_API_KEY` — required
   - `CLIENT_ORIGIN` — your deployed domain, e.g. `https://your-app.vercel.app`
   - `DAILY_QUOTA_LIMIT` — optional, defaults to 1800
4. Deploy. `/api/health` and `/api/transcribe` are served as functions on the same domain as the frontend — no CORS issues in production since it's same-origin.

**Known limitation on Vercel**: serverless functions are stateless and can run as multiple concurrent instances, so the in-memory per-IP rate limiter and daily quota counter (`server/src/lib/quotaGuard.js`) are *best-effort* in this environment — they don't share state across instances or survive cold starts, so they won't perfectly enforce the cap under real concurrent load. This is a deliberate trade-off for a zero-extra-infrastructure deploy; if you outgrow it, replace the in-memory store in `quotaGuard.js` with a shared store (e.g. Upstash Redis, which has a Vercel-friendly free tier) so the count is accurate across instances.

**Also platform-relevant**: Vercel Node functions have a request body size cap (4.5MB) — comfortably above a few-seconds VAD audio segment — and a max execution duration set here to 30s (`vercel.json` → `functions`); raise it if you're on a plan that supports longer durations.

### Alternative: separate deploys

If you'd rather keep the quota guard's in-memory state 100% reliable (a single long-running process, not ephemeral functions), deploy `client/` as a static site on Vercel/Netlify and `server/` separately on a persistent Node host (Render, Fly.io, Railway, a VM). Point the client at the server's URL and set `CLIENT_ORIGIN` on the server to the client's deployed domain. This is two deployments instead of one, which is why the single-project approach above is the default recommendation.
