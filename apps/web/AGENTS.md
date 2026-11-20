# AGENTS.md

Project-specific guidance for AI coding agents working in `apps/web`.

- The interface is being rebuilt from scratch. There is no component library.
- Business logic lives in `src/lib/` and in `packages/*`; a screen renders it and
  does not recompute balances, signatures or token validity.
- Do not edit `packages/*` from this app. Post a finding on the board instead.
- Do not add dependencies.
- Codes are pure black on white inside their own box; the theme never reaches
  inside them.
- Failures are sentences, never spinners.
