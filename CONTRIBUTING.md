# Contributing

Thank you for helping. This document says how to set up the project and what a change needs before it can
be merged.

## Setup

```bash
npm install
npm test
```

Node.js 22.13 or later is required. The only development dependencies are the TypeScript compiler, the
Node type definitions, `linkedom` for DOM tests and `lucide-static` for regenerating icons. Please do not
add runtime dependencies; the project promises to have none.

## Before opening a pull request

- `npm run typecheck` and `npm test` pass with no warning and no error.
- New behaviour comes with tests. A new public method on the service, a store or the HTTP handler needs its
  own test, and a change to a store belongs in `tests/storage/store-contract.ts` so every store is held to it.
- A new renderer draws the sample incident and an empty incident without failing; the renderer tests pick it
  up automatically once it is listed in `BUILT_IN_RENDERERS`.
- Documentation in `README.md` and `docs/` still describes what the code does.

## Coding conventions

The full rules are in [CLAUDE.md](CLAUDE.md). In short:

- Fix causes, not symptoms. Keep code straightforward; add abstraction only when reuse is certain.
- No `any`, no `as` casts and no non-null assertions. Model data with interfaces, classes and string enums
  rather than loose strings or string dictionaries.
- Business rules live in `src/core`. The UI and the stores never duplicate validation.
- Nothing in `src/core`, `src/storage` or `src/ui` may import Node modules or server code.
- No magic numbers or strings scattered through the code; name them.
- Comments explain why, in plain English, never what the code does.

## Commit messages

One line, following the existing history: `type(scope): plain english sentence`, lowercase after the colon.
Types in use are `feat`, `fix`, `refactor`, `perf`, `style`, `docs`, `test` and `misc`.

```
feat(renderers): let the blast radius start from a chosen record
```

## Licensing

By contributing you agree that your contribution is licensed under the Apache License, Version 2.0, as
described in section 5 of the [LICENSE](LICENSE).
