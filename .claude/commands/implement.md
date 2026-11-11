---
description: Implement the next (or a given) task from specs/TASKS.md, test-first
argument-hint: "[task number, e.g. 2.3]"
---

1. Open `specs/TASKS.md` and take task **$ARGUMENTS**, or the first unchecked one if none is given.
2. Read the requirement IDs it cites in `specs/SPEC.md` and the relevant parts of `specs/PLAN.md`.
3. Write tests named with those IDs first, then the minimum code to pass them.
4. Run `npm test`, `npm run lint` and `npm run typecheck` in the package you changed.
5. If the spec turns out to be wrong or unclear, stop and ask. Don't guess.
6. When everything passes, tick the box and report the files changed and the test results.

One task per run. Don't commit.
