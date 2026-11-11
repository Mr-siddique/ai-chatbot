# AI Customer Support Agent

A minimal full-stack AI customer support chat app. Users sign up / log in (JWT + bcrypt), chat with
an AI assistant (OpenRouter), and revisit past conversations stored in MongoDB.

> **Status:** in progress — see [specs/TASKS.md](specs/TASKS.md).
> **Live demo:** https://ai-chatbot-web-zikz.onrender.com
> (free hosting: the API sleeps when idle, so the first request after a while can take 30–60 s)

## Features
- Signup / login / logout with JWT in an httpOnly cookie; passwords hashed with bcrypt
- Protected chat routes; user-scoped conversation history in MongoDB
- AI replies via OpenRouter (configurable free model) with a customer-support system prompt
- Sidebar of past conversations; start new chats
- Bonus: typing indicator, rate limiting, dev/prod config switching
- Dockerized: `docker compose up`

## Tech stack
React + Vite + TypeScript · Node.js + Express + TypeScript · MongoDB (Atlas) · JWT + bcrypt ·
OpenRouter · Vitest · Docker · Render + MongoDB Atlas

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
Three containers: `mongo` (data in the `mongo-data` volume), `server` (Express, health-checked) and `client`
(nginx serving the React build and proxying `/api/` to the server). Set `MONGODB_URI` in `.env` to use Atlas
instead of the bundled MongoDB. `docker compose down -v` stops everything and deletes the local data.

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
| Client API base | `client/.env.development` → `/api` via Vite proxy | `client/.env.production` → `/api` via nginx (Docker) / Render rewrite | mocked |

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
Live: **https://ai-chatbot-web-zikz.onrender.com**

Everything is defined in [`render.yaml`](render.yaml) (a Render Blueprint) and auto-deploys on push to `main`:

| Piece | Where | Notes |
|---|---|---|
| Client | Render static site `ai-chatbot-web` | `/api/*` is rewritten to the API, so the auth cookie stays same-origin; other paths serve `index.html` |
| Server | Render web service `ai-chatbot-api` (Singapore, free) | health check `/health`; `TRUST_PROXY=6` so rate limits see the real client IP behind the rewrite |
| Database | MongoDB Atlas M0 (AWS Mumbai) | app user has read/write on `ai-support` only |

To deploy your own copy: create an Atlas M0 cluster and a database user, then in Render choose
**New → Blueprint**, pick this repo, and enter `MONGODB_URI` and `OPENROUTER_API_KEY` when asked (`JWT_SECRET`
is generated). If Render adds a suffix to the service names, update the two `onrender.com` URLs in `render.yaml`.

Free-tier note: the API sleeps after ~15 min idle (first request then takes 30–60 s). A free uptime monitor
pinging `/health` every 10 minutes keeps it awake.

## How this repo is built
Spec-driven: [specs/SPEC.md](specs/SPEC.md) (what) → [specs/PLAN.md](specs/PLAN.md) (how) →
[specs/TASKS.md](specs/TASKS.md) (checklist). In Claude Code, `/implement` does the next task
test-first and `/verify` checks requirements against tests.
