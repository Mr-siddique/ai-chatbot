# Spec — AI Customer Support Agent

What the app must do. Each requirement has an ID; tests are named with it
(`it('CHAT-05: user B gets 404 for user A's conversation')`).
Source: challenge brief. **M** = must · **B** = bonus · **S** = our addition.

## Auth
| ID | Requirement / acceptance criteria | Pri |
|----|-----------------------------------|-----|
| AUTH-01 | `POST /auth/signup {name, email, password}` → `201 {user}` + sets `token` cookie. Duplicate email (case-insensitive) → `409 EMAIL_TAKEN`. Bad email, name not 1–80 chars, or password not 8–72 bytes (bcrypt ignores bytes after 72) → `400`; nothing saved. Unknown body fields are ignored. | M |
| AUTH-02 | `POST /auth/login {email, password}` → `200 {user}` + cookie. Wrong password and unknown email return the **same** `401 INVALID_CREDENTIALS`. | M |
| AUTH-03 | `POST /auth/logout` → `204`, clears cookie; afterwards `/auth/me` → `401`. | M |
| AUTH-04 | Passwords stored as bcrypt hashes. `password`/`passwordHash` never appear in any response. | M |
| AUTH-05 | `/chat/*` and `/auth/me` without a valid token (missing, tampered, expired, deleted user) → `401`. Client: logged-out users are redirected to `/login`; logged-in users visiting `/login` go to `/`. | M |
| AUTH-06 | `GET /auth/me` → `200 {user}` (restores session on reload). | S |

## Chat
| ID | Requirement / acceptance criteria | Pri |
|----|-----------------------------------|-----|
| CHAT-01 | `POST /chat/send {message, conversationId?}` → `200 {conversationId, conversation, userMessage, assistantMessage}`, where `conversation` is the updated `ConversationSummary` (so the client needs no refetch). Empty or > 4000 chars → `400`. | M |
| CHAT-02 | Both messages saved in MongoDB with the caller's `userId`; conversation `updatedAt` bumped. | M |
| CHAT-03 | `GET /chat/history` → the caller's conversations, most recent activity first (`[]` if none). Each has `title` (from the first message, never changes) and `lastMessagePreview` (the latest message, whitespace collapsed, ≤ 100 chars with `…`), so the sidebar shows where each chat left off. | M |
| CHAT-04 | `GET /chat/history/:id` → `{conversation, messages}` oldest-first. Malformed id → `400`. | M |
| CHAT-05 | Another user's conversation (read or send) → `404`; nothing written to it. | M |
| CHAT-06 | Omitting `conversationId` starts a new conversation titled with the first 60 chars of the message. | S |

## AI
| ID | Requirement / acceptance criteria | Pri |
|----|-----------------------------------|-----|
| AI-01 | Replies from OpenRouter `chat/completions`, model from `OPENROUTER_MODEL`. Key stays server-side. | M |
| AI-02 | A system prompt makes it a polite, concise support agent that won't invent orders/accounts/policies. | S |
| AI-03 | Last `AI_CONTEXT_MESSAGES` messages of the conversation are sent as context. | S |
| AI-05 | When the AI provider's daily free quota is used up (OpenRouter 429 `free-models-per-day`), `/chat/send` → `503 AI_QUOTA_EXCEEDED` with `details.resetAt` (ISO time) when known; nothing saved. The chat box shows "Today's free AI quota has been used up. You can chat again after <time>.", Send stays disabled until then, and the unsent message offers Dismiss (no Retry). Other provider 429s stay `AI_UNAVAILABLE`. | S |
| AI-04 | Provider error/timeout/empty reply → `502 AI_UNAVAILABLE`, **nothing saved** (a just-created conversation is removed). Tests never hit the real API. | S |

## Client
| ID | Requirement / acceptance criteria | Pri |
|----|-----------------------------------|-----|
| UI-01 | React (Vite) pages: `/login`, `/signup`, `/` and `/c/:id` (chat). | M |
| UI-02 | Textarea input: Enter sends, Shift+Enter newline, Send disabled when empty or pending. | M |
| UI-03 | User message shows immediately; AI reply appears on response; on error, show message + Retry and keep the text. Auto-scroll to newest. | M |
| UI-04 | Sidebar lists past conversations (newest first) + "New chat"; clicking one opens it; a new chat appears at the top after the first send. | M |
| UI-05 | All calls through one Axios instance (`/api`, `withCredentials`); any `401` → back to login. | M |
| UI-06 | Token is never stored or read in JS (httpOnly cookie only). | M |
| UI-07 | Logout button. | M |
| UI-08 | Simple, clean CSS; usable at 360px wide; labelled inputs. | M |

## DevOps
| ID | Requirement / acceptance criteria | Pri |
|----|-----------------------------------|-----|
| OPS-01 | Dockerfiles for client (build → nginx, proxies `/api/`) and server (multi-stage, non-root). | M |
| OPS-02 | `docker compose up --build` with a filled `.env` runs mongo + server + client at `http://localhost:8080`; signup → chat works. | M |
| OPS-03 | `.env.example` in root, `client/`, `server/` listing every env var. | M |
| OPS-04 | README with setup steps (local, Docker, deploy) and the deployed link. | M |
| OPS-05 | Deployed: client on Vercel, server on Render, DB on Atlas. | M |

## Bonus
| ID | Requirement / acceptance criteria | Pri |
|----|-----------------------------------|-----|
| BON-01 | "Assistant is typing…" indicator while a send is pending (`aria-live`). | B |
| BON-02 | `express-rate-limit`: `/chat/send` per user (`RATE_LIMIT_MAX` / window), auth routes per IP → `429 RATE_LIMITED`; client shows a friendly message. | B |
| BON-03 | `NODE_ENV` switches cookie `secure`, bcrypt cost, log format, error detail; bad/missing env vars fail at boot. | B |

**Out of scope:** password reset, email verification, OAuth, streaming, deleting/renaming chats.

---

## API contract
The server mounts routes at the root as the brief specifies. The client calls them through `/api`
(`/api/auth/login` → `/auth/login`), so the auth cookie is always same-origin.

Errors: `{ "error": { "code": "...", "message": "..." } }` — codes: `VALIDATION_ERROR` 400,
`UNAUTHENTICATED` 401, `INVALID_CREDENTIALS` 401, `NOT_FOUND` 404, `EMAIL_TAKEN` 409,
`RATE_LIMITED` 429, `AI_UNAVAILABLE` 502, `AI_QUOTA_EXCEEDED` 503, `INTERNAL` 500.

Cookie: `token=<JWT>`; `httpOnly`, `SameSite=Lax`, `Secure` in production, JWT payload `{ sub: userId }`.

| Method | Path | Auth | Body → Response |
|--------|------|------|-----------------|
| POST | `/auth/signup` | – | `{name, email, password}` → `201 {user}` |
| POST | `/auth/login` | – | `{email, password}` → `200 {user}` |
| POST | `/auth/logout` | – | → `204` |
| GET | `/auth/me` | ✓ | → `200 {user}` |
| POST | `/chat/send` | ✓ | `{message, conversationId?}` → `200 {conversationId, conversation, userMessage, assistantMessage}` |
| GET | `/chat/history` | ✓ | → `200 {conversations: ConversationSummary[]}` |
| GET | `/chat/history/:id` | ✓ | → `200 {conversation, messages: Message[]}` |
| GET | `/health` | – | → `200 {status: "ok"}` |

```ts
type User = { id: string; name: string; email: string; createdAt: string }
type Message = { id: string; conversationId: string; role: 'user' | 'assistant'; content: string; createdAt: string }
type ConversationSummary = { id: string; title: string; lastMessagePreview: string; updatedAt: string; createdAt: string }
```

## Data model (MongoDB)
- **users** — `email` (unique, lowercase), `name`, `passwordHash` (`select: false`), timestamps.
- **conversations** — `userId`, `title`, `lastMessagePreview` (set on every send), timestamps. Index `{ userId: 1, updatedAt: -1 }`.
- **messages** — `conversationId`, `userId`, `role`, `content`, `createdAt`. Index `{ conversationId: 1, createdAt: 1 }`.

Every chat query filters by `userId` from the token, never from the request body.
