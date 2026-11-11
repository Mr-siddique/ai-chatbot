# AI Customer Support Agent

Full-stack challenge: React client + Express server, JWT/bcrypt auth, chat with an LLM via
OpenRouter, history in MongoDB.

## Specs (source of truth)
- [specs/SPEC.md](specs/SPEC.md): what to build (requirement IDs, acceptance criteria, API, data model)
- [specs/PLAN.md](specs/PLAN.md): how to build it (stack, decisions, layout, config, deployment)
- [specs/TASKS.md](specs/TASKS.md): ordered checklist

If code and spec disagree, update the spec first, then the code. Don't build what isn't in the spec.

## Workflow
- `/implement [task]`: do the next unchecked task (or the one named), test-first, then tick it.
- `/verify [section]`: check each requirement against the tests and code.

## Rules
- Name tests after requirement IDs: `it('AUTH-02: same 401 for unknown email and wrong password')`.
- Server: routes (zod validation) → services (logic) → models. Throw `AppError`, and let
  `errorHandler` format it. Read env only in `config.ts`.
- Every chat query filters by `userId` from `req.user`. Another user's data → 404.
- JWT lives only in an httpOnly cookie. The client never touches it, and nothing goes in localStorage.
- Tests never call OpenRouter (inject a fake `AiService` or SDK `fetcher`). The only exception is
  `server/test/live/`, run on demand with `npm run test:live` (uses free-tier quota).
- Never log passwords, tokens or API keys. Every new env var goes into the matching `.env.example`
  and the config table in PLAN.md.
- Run `npm test`, `npm run lint` and `npm run typecheck` in the package you changed before saying you're done.
- Don't commit unless asked.

## Keep the specs current
- At the end of each session, add a line to the **Log** in `specs/TASKS.md`: what was done, anything
  half-finished or blocked, and any gotchas. Read the log first when starting a session.
- When you make a non-obvious choice (a library, a pattern, a deviation from the plan), add a
  one-line "what + why" under **Key decisions** in `specs/PLAN.md`.

## Commands
```bash
cd server && npm run dev   # :4000
cd client && npm run dev   # :5173 (proxies /api → :4000)
npm test                   # in either package
docker compose up --build  # :8080
```
