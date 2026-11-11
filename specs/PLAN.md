# Plan — how we build it

## Stack
| Layer | Choice |
|-------|--------|
| Client | React 18 + Vite + TypeScript, React Router, Axios, plain CSS |
| Server | Node 22, Express, TypeScript, mongoose, bcrypt, jsonwebtoken, cookie-parser, zod, helmet |
| DB | MongoDB 7 in Docker locally, MongoDB Atlas (free tier) in prod |
| AI | OpenRouter, called with native `fetch` (no SDK) |
| Tests | Vitest; supertest + mongodb-memory-server (server); Testing Library + MSW (client) |
| Hosting | Vercel (client) · Render (server) · Atlas (DB) |

## Key decisions
- **OpenRouter** over Hugging Face: free models, chat format with system prompts, model is just an env var.
- **JWT in an httpOnly cookie**, not localStorage, so XSS can't steal it. The client always calls
  `/api/*` on its own origin, and a proxy strips `/api` and forwards to the server:
  Vite proxy (dev) · nginx (Docker) · Vercel rewrite (prod). This keeps the cookie first-party everywhere.
- **Stateless logout**: logout clears the cookie but doesn't revoke the JWT, so a copied token stays valid until
  it expires (`JWT_EXPIRES_IN`). A server-side deny-list isn't worth it for this app. `requireAuth` reads only the
  cookie (no `Authorization` header) and rejects tokens for deleted users.
- **TypeScript + Vitest** on both sides: one test runner, types catch contract drift.
- **Default model `nvidia/nemotron-3.5-lightning:free`** (checked 2026-11-11; the Llama 3.3 free tier
  was removed and the Gemma free models were rate-limited). It's a reasoning model: read only
  `message.content`, ignore `message.reasoning`, and don't set a low `max_tokens` (one reply used about 400
  tokens). Free tier allows 50 requests/day, so tests always use a fake AI.
- **No DB transactions**: messages are saved only after the AI succeeds, so a failure just deletes a
  conversation created in that request.

## Layout
```
server/src/
  index.ts  app.ts (createApp(deps), no listen)  config.ts (zod-validated env)  db.ts
  middleware/  requireAuth.ts  errorHandler.ts  rateLimit.ts
  routes/      auth.ts  chat.ts           # zod validation + HTTP only
  services/    auth.ts  chat.ts  ai.ts    # logic; ai.ts exports AiService interface (stubbed in tests)
  models/      User.ts  Conversation.ts  Message.ts
  lib/         AppError.ts  jwt.ts
server/test/   *.test.ts

client/src/
  api/         client.ts (axios, /api, withCredentials, 401 handler)  types.ts
  auth/        AuthContext.tsx  ProtectedRoute.tsx
  pages/       LoginPage  SignupPage  ChatPage
  components/  ConversationList  MessageList  MessageInput  TypingIndicator
```

## Send-message flow
1. `requireAuth` reads the cookie → `req.user`.
2. Find the conversation by `{ _id, userId }` (else 404), or create one if no id was sent.
3. Load the last N messages → `ai.reply(history, message)`.
4. On success, save the user and assistant messages and bump `updatedAt`. On failure, delete the new
   conversation and return 502.

## Configuration
| Var | Default | Notes |
|-----|---------|-------|
| `NODE_ENV` | `development` | `production` → secure cookie, JSON logs, no error details, `trust proxy` |
| `PORT` | `4000` | |
| `MONGODB_URI` | — (required) | |
| `JWT_SECRET` | — (required, ≥ 32 chars) | |
| `JWT_EXPIRES_IN` | `7d` | number + `s`/`m`/`h`/`d`/`w`; also the cookie Max-Age |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS fallback if not behind the proxy |
| `OPENROUTER_API_KEY` | — (required) | |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3.5-lightning:free` | |
| `AI_TIMEOUT_MS` / `AI_CONTEXT_MESSAGES` | `30000` / `10` | |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | `60000` / `20` / `10` | |
| `VITE_API_BASE_URL` (client) | `/api` | |
| `API_PROXY_TARGET` (client, dev) | `http://localhost:4000` | |

## Deployment
- **Docker:** `server` is `node:22-slim` (bcrypt builds cleanly on glibc), multi-stage, runs as `USER node`.
  `client` is a Vite build served by `nginx:alpine` with `location /api/ { proxy_pass http://server:4000/; }`
  and an SPA fallback. Compose runs mongo (healthcheck + volume) + server + client on `8080`.
- **Render:** web service rooted at `server/`, start `node dist/index.js`, health check `/health`.
- **Vercel:** rooted at `client/`, `vercel.json` rewrites `/api/:path*` to the Render URL.
- **Atlas:** M0 cluster with network access `0.0.0.0/0` (Render IPs change).
