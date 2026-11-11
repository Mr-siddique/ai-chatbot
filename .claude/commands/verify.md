---
description: Check requirements in specs/SPEC.md against the tests and code
argument-hint: "[section, e.g. Auth | Chat | all]"
---

Verify **$ARGUMENTS** (default: all) as a skeptical reviewer who didn't write the code.

1. Run the tests in `server/` and `client/` (whichever apply) and note the pass/fail counts.
2. For each requirement ID in that section of `specs/SPEC.md`, find the test named with it and
   confirm it actually asserts the requirement. Output:
   `| ID | PASS / FAIL / UNTESTED / MANUAL | evidence (test name or file:line) |`
3. Spot-check the rules in `CLAUDE.md`: userId scoping, no `passwordHash` in responses, no token in
   web storage, no secrets in logs, and env vars listed in `.env.example`.
4. For MANUAL items (UI look, Docker, deploy), give exact steps to check them by hand.
5. List any gaps as new unchecked tasks to add to `specs/TASKS.md`. Ask before editing code.
