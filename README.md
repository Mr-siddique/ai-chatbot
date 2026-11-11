# AI Customer Support Agent

A minimal full-stack AI customer support chat app. Users sign up / log in (JWT + bcrypt), chat with
an AI assistant (OpenRouter), and revisit past conversations stored in MongoDB.

> **Status:** in progress — see [specs/TASKS.md](specs/TASKS.md).
> **Live demo:** _TBD_

## Features
- Signup / login / logout with JWT in an httpOnly cookie; passwords hashed with bcrypt
- Protected chat routes; user-scoped conversation history in MongoDB
- AI replies via OpenRouter (configurable free model) with a customer-support system prompt
- Sidebar of past conversations; start new chats
- Bonus: typing indicator, rate limiting, dev/prod config switching
- Dockerized: `docker compose up`

## Tech stack
React + Vite + TypeScript · Node.js + Express + TypeScript · MongoDB (Atlas) · JWT + bcrypt ·
OpenRouter · Vitest · Docker · Vercel + Render

## Architecture
```
Browser → client (React) → /api/* proxy → server (Express) → MongoDB
                                               └→ OpenRouter
```
Details: [specs/PLAN.md](specs/PLAN.md) · API: [specs/SPEC.md](specs/SPEC.md#api-contract)

## Quick start (Docker)
```bash
cp .env.example .env        # set JWT_SECRET and OPENROUTER_API_KEY
docker compose up --build   # http://localhost:8080
```

## Local development (no Docker)
Prereqs: Node 22, a MongoDB (local or Atlas), an [OpenRouter key](https://openrouter.ai/keys).
```bash
cd server && cp .env.example .env && npm install && npm run dev   # :4000
cd client && cp .env.example .env && npm install && npm run dev   # :5173
```

## Tests
```bash
cd server && npm test        # unit + API tests (in-memory MongoDB, fake AI)
cd client && npm test        # component tests (mocked API)
cd server && npm run test:live   # optional: one real OpenRouter call (uses free quota)
```

## Environment variables
See `server/.env.example`, `client/.env.example`, root `.env.example`, and the table in
[specs/PLAN.md](specs/PLAN.md#configuration).

## Environments (dev / prod)
`NODE_ENV` on the server and the Vite mode on the client switch behaviour; the code is the same.

| | development | production | test |
|---|---|---|---|
| Run | `npm run dev` (both) | `npm run build && npm start` · `docker compose up` | `npm test` |
| Auth cookie `Secure` | off (works on http://localhost) | on | off |
| bcrypt cost | 10 | 12 | 4 |
| Logs | readable, colored, `debug` | JSON lines, `info` | silent |
| 500 error details in response | message included | hidden | message included |
| `trust proxy` (real client IP behind Render/nginx) | off | on | off |
| Rate limiting | on | on | off (tests opt in) |
| Client API base | `client/.env.development` → `/api` via Vite proxy | `client/.env.production` → `/api` via nginx / Vercel rewrite | mocked |

- Override the log level with `LOG_LEVEL` (e.g. `LOG_LEVEL=debug` in production while investigating).
- Missing or invalid env vars stop the server at startup with a list of every problem.
- Every response carries an `X-Request-Id`; the same id is in that request's log line.

## API summary
| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/signup` | – |
| POST | `/auth/login` | – |
| POST | `/auth/logout` | – |
| GET | `/auth/me` | ✓ |
| POST | `/chat/send` | ✓ |
| GET | `/chat/history` | ✓ |
| GET | `/chat/history/:conversationId` | ✓ |
| GET | `/health` | – |

## Deployment
Client → Vercel (`client/vercel.json` rewrites `/api/*` to the server) · Server → Render
· DB → MongoDB Atlas M0. Details in [specs/PLAN.md](specs/PLAN.md#deployment).

## How this repo is built
Spec-driven: [specs/SPEC.md](specs/SPEC.md) (what) → [specs/PLAN.md](specs/PLAN.md) (how) →
[specs/TASKS.md](specs/TASKS.md) (checklist). In Claude Code, `/implement` does the next task
test-first and `/verify` checks requirements against tests.
