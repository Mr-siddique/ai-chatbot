# Tasks

Work top to bottom, one task at a time. Tick a box only when its tests pass. IDs refer to `SPEC.md`.

## 1. Scaffold
- [x] **1.1** Server: package.json, tsconfig (strict, ESM), vitest, `config.ts`, `app.ts`, `index.ts`, `db.ts`, `GET /health`, test helper (in-memory Mongo)
- [x] **1.2** Client: Vite React-TS, vitest + Testing Library + MSW, `/api` dev proxy

## 2. Auth (server)
- [x] **2.1** `AppError` + `errorHandler` (contract error shape)
- [x] **2.2** `User` model, `jwt.ts`, cookie options helper — AUTH-04
- [x] **2.3** `POST /auth/signup` — AUTH-01, AUTH-04
- [x] **2.4** `POST /auth/login` — AUTH-02
- [x] **2.5** `requireAuth` + `GET /auth/me` + `POST /auth/logout` — AUTH-03, AUTH-05, AUTH-06

## 3. AI + Chat (server)
- [x] **3.1** `AiService` interface + OpenRouter impl + system prompt + timeout/error handling (fake `fetch` in tests) — AI-01..04
- [x] **3.2** `Conversation` + `Message` models
- [x] **3.3** `POST /chat/send` (new + existing conversation, rollback on AI failure) — CHAT-01, 02, 06, AI-04
- [x] **3.4** `GET /chat/history` + `GET /chat/history/:id` — CHAT-03, 04
- [x] **3.5** Two-user isolation tests — CHAT-05

## 4. Client
- [x] **4.1** Axios client + `AuthContext` (`/auth/me` on boot) + protected routes — UI-05, UI-06, AUTH-05
- [x] **4.2** Login + Signup pages — UI-01
- [x] **4.3** Chat layout: header with logout, sidebar, thread, input; responsive CSS — UI-07, UI-08
- [x] **4.4** Conversation list + `/c/:id` loading — UI-04
- [x] **4.5** Send flow: optimistic message, error + retry, new-chat navigation — UI-02, UI-03

## 5. Bonus
- [x] **5.1** Typing indicator — BON-01
- [x] **5.2** Rate limiting + client 429 message — BON-02
- [x] **5.3** Env-based config + fail-fast validation — BON-03

## 6. Ship
- [ ] **6.1** Dockerfiles + nginx.conf + docker-compose.yml; manual check: signup → chat — OPS-01, 02, 03
- [x] **6.2** Deploy (Render + Vercel + Atlas) and add the link to the README — OPS-05
- [ ] **6.3** Final README pass + `/verify` over the whole spec — OPS-04

## Log
Newest first. One line per session: what was done, anything half-finished or blocked, gotchas.
- 2026-11-13 — 6.2 done: live at https://ai-chatbot-web-zikz.onrender.com (API https://ai-chatbot-api-0txk.onrender.com).
  Gotchas: Render suffixed service names → fixed rewrite/CLIENT_ORIGIN; via the static-site rewrite each request
  came from a different proxy IP (XFF has 6 entries, client first; direct = 3) → TRUST_PROXY=6, verified one shared
  rate-limit counter and fake XFF can't escape. Live E2E: signup, Secure+HttpOnly+SameSite cookie, AI reply 15 s
  through the rewrite, context kept, history preview, logout, SPA deep link. Note: direct calls to the API URL can
  still spoof XFF to dodge the per-IP auth limit (browser path is safe). 6.1 Docker still to do.
- 2026-11-13 — Atlas configured (M0, AWS Mumbai, least-privilege user, connection string in
  ~/.ai-chatbot-secrets/atlas.env, verified read/write + other DBs blocked). render.yaml added (API in Singapore +
  static site with /api rewrite); builds simulated as Render runs them and the pruned prod build ran against Atlas.
  TRUST_PROXY added (hop count; check real hops after deploy). To verify live: /api rewrite with a slow AI reply.
- 2026-11-13 — AI-05 added: OpenRouter daily free quota (429 mentioning free-models-per-day) → 503
  AI_QUOTA_EXCEEDED with details.resetAt (from X-RateLimit-Reset). Chat box shows "Today’s free AI quota has been
  used up. You can chat again <after time | tomorrow>.", Send locked until reset, unsent message has Dismiss only.
  Other 429s stay AI_UNAVAILABLE + Retry. Detection matches OpenRouter's message text — not live-verified (would
  burn the quota); the server logs kind + raw message on every AI failure. Server 203 / client 111 tests green.
- 2026-11-13 — Sidebar shows the latest message: `lastMessagePreview` on conversations (set on every send, ≤100
  chars), and POST /chat/send returns the updated `conversation` so the client updates its cache with no
  /chat/history refetch. SPEC CHAT-01/03 + data model updated. Dev DB backfilled once. Also: `COOKIE_SECURE`
  override (for plain-http docker compose) and index.ts now exits clearly on EADDRINUSE (Express 5 passes listen
  errors to the callback; a tsx-watch restart race left a silent dead server → Vite 502). Server 194 / client 100
  tests green. Still in 6.1.
- 2026-11-12 — 5.3 done: pino-http request logs (method/path/status/ms, X-Request-Id, warn 4xx / error 5xx,
  /health skipped, no headers or bodies), logger redaction (cookie/auth/password/passwordHash/apiKey), optional
  LOG_LEVEL, environments.test.ts pins the per-NODE_ENV table, client .env.development/.env.production, README
  "Environments" section. Server 185 / client 97 tests green. Bonus (section 5) complete. Next: 6.1.
- 2026-11-12 — 5.2 done: express-rate-limit v8 — /chat/send per user (RATE_LIMIT_MAX per window), signup+login
  share a per-IP 15-min budget (AUTH_RATE_LIMIT_MAX); 429 RATE_LIMITED in contract shape + RateLimit/Retry-After
  headers; off when NODE_ENV=test (config.rateLimit.enabled). Client shows the server message (no auto-retry).
  Live check: 10×401 then 429. Server 170 / client 97 tests green. Next: 5.3.
- 2026-11-12 — 5.1 done: TypingIndicator (assistant-style bubble, 3 bouncing dots aria-hidden, role=status
  "Assistant is typing…", no animation under prefers-reduced-motion) replaces the plain status. 94 client tests
  green. Next: 5.2.
- 2026-11-12 — 4.5 done: send flow (optimistic message, "Assistant is replying…", failed → "Not sent" +
  Retry/Dismiss, new chat → /c/:id, sidebar refetch, one send at a time). useSendMessage does cache updates in
  the hook (mutate() callbacks don't run after unmount). 90 client tests, stable over 5 runs. Client (section 4)
  complete — core app works end to end. Next: 5.1.
- 2026-11-12 — 4.4 done: useConversations/useConversation (TanStack), ConversationList (NavLink highlight,
  relative time, loading/empty/error+Retry), MessageList (role=log, pre-wrap, scroll to newest), ChatPage reads
  /c/:id with not-found (400/404) and retry states. MSW fixtures + default empty history. 80 client tests green.
  Next: 4.5.
- 2026-11-12 — 4.3 done: ChatLayout (header with name + logout, sidebar with New chat, main; <768px the sidebar
  is a drawer: menu button, Escape/backdrop/navigation close it), MessageInput (Enter sends, Shift+Enter newline,
  IME-safe, 4000 cap + counter), empty state. 61 client tests green. Gotcha: jsdom can't apply media queries and
  role queries give display:none elements no name — find the menu button by aria-label. Next: 4.4.
- 2026-11-12 — 4.2 done: Login + Signup pages (useMutation, client checks mirroring AUTH-01, server field
  errors under fields, EMAIL_TAKEN → "Log in instead", focus first error), TextField component, PublicOnly
  returns users to their original page via safeRedirectPath (mutation-tested). 49 client tests green.
  Gotcha: react-hooks/refs lint rejects refs grouped in an object — use one useRef per field. Next: 4.3.
- 2026-11-12 — Added TanStack Query (v5) for server data; /auth/me now cached under queryKeys.me and
  AuthProvider is a thin Context over it. Logout/expiry remove all other cached queries. 25 client tests green.
- 2026-11-12 — Pages lazy-loaded (React.lazy + Suspense in App.tsx); pages live in src/pages/ with default
  exports, one build chunk each. Shared FullPageStatus component.
- 2026-11-12 — 4.1 done: api/ (axios client, ApiError, typed auth/chat calls), AuthProvider (/auth/me on load,
  in-memory only), RequireAuth/PublicOnly guards, routes with placeholder pages; 23 client tests green.
  React Router is v8 (import from `react-router`). Only 401 UNAUTHENTICATED logs out — not INVALID_CREDENTIALS.
  Gotcha: <output> has role=status. Next: 4.2.
- 2026-11-12 — 3.5 done: chat.isolation.test.ts (Bob vs Alice on every chat endpoint + userId-in-body/query
  attempts) and a query guard (mongoose debug hook) that fails if any conversations/messages query lacks a userId
  filter — mutation-tested with findById. Internal updateOne/deleteOne now also filter by userId. 159 tests
  green. Server API (sections 2–3) complete. Open question: raise AI_TIMEOUT_MS to 60 s. Next: 4.1.
- 2026-11-12 — 3.4 done: GET /chat/history (newest activity first) + GET /chat/history/:id (messages oldest
  first, 400 bad id, 404 foreign/missing — identical bodies); 153 tests green. Most CHAT-05 cases already
  covered in send/history suites. Next: 3.5.
- 2026-11-11 — Moved scripts/smoke-ai.ts into test/live/openrouter.live.test.ts (`npm run test:live`,
  excluded from `npm test`). Live run caught a bug: a timeout during body download surfaced as a raw
  TimeoutError, not "timed out" — fixed + unit test. Live latency seen: 12–22 s, one >30 s (timed out).
- 2026-11-11 — 3.3 done: POST /chat/send (services/chat.ts + routes/chat.ts, AiService injected via createApp),
  142 tests green, live E2E via proxy OK (~12 s/reply, context remembered). Writes happen only after the AI
  replies. Prompt follow-up: model still describes UI it can't know ("Edit address" in a dashboard). Next: 3.4.
- 2026-11-11 — 3.2 done: Conversation + Message models with list/read indexes and public serializers (no
  userId); 119 tests green. Always sort messages with `CHRONOLOGICAL` ({createdAt, _id}) — user msg and AI reply
  share a timestamp. Optional later: AI_CONTEXT_MAX_CHARS budget in buildMessages (discussed, deferred). Next: 3.3.
- 2026-11-11 — 3.1 revised: switched services/ai.ts to @openrouter/sdk (same AiService interface), 108 tests
  green, live smoke OK. Gotchas: SDK default retries 5xx for up to 1h → disabled; title header is now
  X-OpenRouter-Title; no `reasoning.exclude` option; postinstall script denied (only checks model-type staleness).
- 2026-11-11 — 3.1 done: services/ai.ts (AiService, OpenRouter client, system prompt, context window, AiError
  for HTTP/200-with-error/empty/invalid JSON/network/timeout), 107 tests green. Added `npm run smoke:ai` (1 real
  request; not in tests). Live replies take 13–15 s. Prompt tuned: plain text, no invented account data, may use
  facts from the chat but not claim they're "on file". Next: 3.2.
- 2026-11-11 — 2.5 done: requireAuth (cookie only) + GET /auth/me + POST /auth/logout; 87 tests green.
  Full signup → me → logout → login flow verified through the Vite /api proxy. Auth section complete. Next: 3.1.
- 2026-11-11 — 2.4 done: POST /auth/login, 72 tests green. Unknown email compares against a dummy bcrypt
  hash so timing matches a wrong password (measured 57 vs 58 ms on local Mongo). Next: 2.5.
- 2026-11-11 — 2.3 done: POST /auth/signup (routes/auth.ts + services/auth.ts), 60 tests green, smoke-tested on
  local Mongo. Password capped at 72 bytes (bcrypt limit) — SPEC AUTH-01 updated. Duplicates decided by the
  unique index (race-safe), not a pre-check. Next: 2.4.
- 2026-11-11 — 2.2 done: User model (passwordHash select:false, toPublicUser), jwt sign/verify
  (HS256 pinned), auth cookie helpers; 45 tests green. JWT_EXPIRES_IN parsed to seconds in config (zod 4:
  use `.prefault()` so defaults go through transforms). Next: 2.3.
- 2026-11-11 — 2.1 done: AppError + errorHandler + 404 catch-all, 24 tests green. Malformed/oversized
  JSON → 400 VALIDATION_ERROR; unexpected errors → generic 500 (message as details only outside prod). Next: 2.2.
- 2026-11-11 — 1.2 done: client scaffold (React 19, Vite 8, Vitest 5, MSW 3), 3 tests green, dev proxy
  verified end to end. Gotcha: MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`. Router/axios
  deferred to 4.1. Next: 2.1.
- 2026-11-11 — 1.1 done: server scaffold (Express 5, TS 6, zod 4, mongoose 9, vitest 5), 12 tests green.
  Gotchas: npm now blocks install scripts — approved bcrypt/esbuild/mongodb-memory-server via `allowScripts`
  in package.json. Express 5 forwards async errors to the error handler natively. Docker Desktop must be
  running for local mongo. Next: 1.2.
- 2026-11-11 — Specs written. Next: 1.1.
