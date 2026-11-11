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
- [ ] **4.1** Axios client + `AuthContext` (`/auth/me` on boot) + protected routes — UI-05, UI-06, AUTH-05
- [ ] **4.2** Login + Signup pages — UI-01
- [ ] **4.3** Chat layout: header with logout, sidebar, thread, input; responsive CSS — UI-07, UI-08
- [ ] **4.4** Conversation list + `/c/:id` loading — UI-04
- [ ] **4.5** Send flow: optimistic message, error + retry, new-chat navigation — UI-02, UI-03

## 5. Bonus
- [ ] **5.1** Typing indicator — BON-01
- [ ] **5.2** Rate limiting + client 429 message — BON-02
- [ ] **5.3** Env-based config + fail-fast validation — BON-03

## 6. Ship
- [ ] **6.1** Dockerfiles + nginx.conf + docker-compose.yml; manual check: signup → chat — OPS-01, 02, 03
- [ ] **6.2** Deploy (Render + Vercel + Atlas) and add the link to the README — OPS-05
- [ ] **6.3** Final README pass + `/verify` over the whole spec — OPS-04

## Log
Newest first. One line per session: what was done, anything half-finished or blocked, gotchas.
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
