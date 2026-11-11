# Tasks

Work top to bottom, one task at a time. Tick a box only when its tests pass. IDs refer to `SPEC.md`.

## 1. Scaffold
- [x] **1.1** Server: package.json, tsconfig (strict, ESM), vitest, `config.ts`, `app.ts`, `index.ts`, `db.ts`, `GET /health`, test helper (in-memory Mongo)
- [ ] **1.2** Client: Vite React-TS, vitest + Testing Library + MSW, `/api` dev proxy

## 2. Auth (server)
- [ ] **2.1** `AppError` + `errorHandler` (contract error shape)
- [ ] **2.2** `User` model, `jwt.ts`, cookie options helper — AUTH-04
- [ ] **2.3** `POST /auth/signup` — AUTH-01, AUTH-04
- [ ] **2.4** `POST /auth/login` — AUTH-02
- [ ] **2.5** `requireAuth` + `GET /auth/me` + `POST /auth/logout` — AUTH-03, AUTH-05, AUTH-06

## 3. AI + Chat (server)
- [ ] **3.1** `AiService` interface + OpenRouter impl + system prompt + timeout/error handling (fake `fetch` in tests) — AI-01..04
- [ ] **3.2** `Conversation` + `Message` models
- [ ] **3.3** `POST /chat/send` (new + existing conversation, rollback on AI failure) — CHAT-01, 02, 06, AI-04
- [ ] **3.4** `GET /chat/history` + `GET /chat/history/:id` — CHAT-03, 04
- [ ] **3.5** Two-user isolation tests — CHAT-05

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
- 2026-11-11 — 1.1 done: server scaffold (Express 5, TS 6, zod 4, mongoose 9, vitest 5), 12 tests green.
  Gotchas: npm now blocks install scripts — approved bcrypt/esbuild/mongodb-memory-server via `allowScripts`
  in package.json. Express 5 forwards async errors to the error handler natively. Docker Desktop must be
  running for local mongo. Next: 1.2.
- 2026-11-11 — Specs written. Next: 1.1.
