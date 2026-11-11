# Plan — how we build it

## Stack
| Layer | Choice |
|-------|--------|
| Client | React 19 + Vite + TypeScript, React Router 8, Axios, TanStack Query, plain CSS |
| Server | Node 22, Express, TypeScript, mongoose, bcrypt, jsonwebtoken, cookie-parser, zod, helmet |
| DB | MongoDB 7 in Docker locally, MongoDB Atlas (free tier) in prod |
| AI | OpenRouter via the official `@openrouter/sdk` |
| Tests | Vitest; supertest + mongodb-memory-server (server); Testing Library + MSW (client) |
| Hosting | Render (static site + API web service) · Atlas (DB) |

## Key decisions
- **OpenRouter** over Hugging Face: free models, chat format with system prompts, model is just an env var.
- **`@openrouter/sdk`** (user's choice over plain fetch). Configured with `retryConfig: { strategy: 'none' }`: the SDK
  default retries 5xx with backoff for up to an hour, and `timeoutMs` is per attempt, so one call bounded by
  `AI_TIMEOUT_MS` keeps chat requests predictable. Tests swap the network via `HTTPClient({ fetcher })`. The SDK
  validates responses strictly; anything unexpected becomes an `AiError`.
- **JWT in an httpOnly cookie**, not localStorage, so XSS can't steal it. The client always calls
  `/api/*` on its own origin, and a proxy strips `/api` and forwards to the server:
  Vite proxy (dev) · nginx (Docker) · Vercel rewrite (prod). This keeps the cookie first-party everywhere.
- **Stateless logout**: logout clears the cookie but doesn't revoke the JWT, so a copied token stays valid until
  it expires (`JWT_EXPIRES_IN`). A server-side deny-list isn't worth it for this app. `requireAuth` reads only the
  cookie (no `Authorization` header) and rejects tokens for deleted users.
- **Client state**: server data (current user, conversations, messages) lives in TanStack Query under
  `queryKeys` (`src/api/queryClient.ts`); everything else is React state/Context. Logout and session expiry drop
  all cached server data so the next user never sees it. Mutations never auto-retry (no double sends).
- **Lazy-loaded pages**: each page in `src/pages/` is its own chunk (`React.lazy` + `Suspense`).
- **TypeScript + Vitest** on both sides: one test runner, types catch contract drift.
- **Default model `nvidia/nemotron-3.5-lightning:free`** (checked 2026-11-11; the Llama 3.3 free tier
  was removed and the Gemma free models were rate-limited). It's a reasoning model: read only
  `message.content`, ignore `message.reasoning`, and don't set a low `max_tokens` (one reply used about 400
  tokens). Free tier allows 50 requests/day, so tests always use a fake AI.
- **No DB transactions**: nothing is written until the AI has replied, so an AI failure needs no cleanup.

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
  api/         client.ts (axios, /api, withCredentials, 401 handler)  queryClient.ts (TanStack, queryKeys)
               types.ts  auth.ts  chat.ts
  auth/        AuthProvider.tsx  context.ts (useAuth)  routeGuards.tsx
  pages/       LoginPage  SignupPage  ChatPage
  components/  ConversationList  MessageList  MessageInput  TypingIndicator
```

## Send-message flow
1. `requireAuth` reads the cookie → `req.user`.
2. Validate `{message (trimmed, 1–4000), conversationId?}`.
3. If `conversationId` is given, find it by `{ _id, userId }` (else 404). Load its last `AI_CONTEXT_MESSAGES` messages.
4. `ai.reply(history, message)`. On `AiError` → 502 `AI_UNAVAILABLE`, **nothing has been written yet**.
5. Only now save: the new conversation (if any), then both messages via `insertMany`, then set `updatedAt` and
   `lastMessagePreview` (the reply) and return the updated summary. If saving the messages fails, a conversation
   created in this request is deleted.
6. Client: `useSendMessage` puts the returned `conversation` at the top of the cached sidebar list and appends the
   messages to the cached conversation — no refetch of `/chat/history`.

## Configuration
| Var | Default | Notes |
|-----|---------|-------|
| `NODE_ENV` | `development` | `production` → secure cookie, JSON logs, no error details, `trust proxy` |
| `PORT` | `4000` | |
| `COOKIE_SECURE` | on in production | optional; `false` for plain-http docker compose |
| `TRUST_PROXY` | `1` in production, off elsewhere | proxy hops in front of the API (real client IP for rate limits) |
| `LOG_LEVEL` | `debug` dev · `info` prod · `silent` test | optional override |
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
- **Render** (`render.yaml` Blueprint): `ai-chatbot-api` web service (Singapore, free; build `npm ci --include=dev && npm run build && npm prune --omit=dev`, health `/health`) and `ai-chatbot-web` static site whose `/api/*` rewrite proxies to the API (same-origin cookie) plus an SPA fallback. Secrets (`MONGODB_URI`, `OPENROUTER_API_KEY`) are set in the dashboard; `JWT_SECRET` is generated by Render.
- **Atlas:** M0 cluster `ai-chatbot` (AWS Mumbai) in project `ai-chatbot-app`; network access `0.0.0.0/0` (Render IPs change); app user `ai-chatbot-app` with readWrite on `ai-support` only.
