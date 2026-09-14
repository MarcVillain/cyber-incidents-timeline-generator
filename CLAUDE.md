# CLAUDE.md, source of truth

This file governs how AI assistants work on this project. When in doubt, defer to this file.

---

## Project Architecture

**TypeScript library and tool**, compiled by `tsc` alone to ES modules in `dist/`. Zero runtime dependencies.

### Layer Stack
```
ui (workspace, renderers)  ->  TimelineApi  ->  TimelineService  ->  TimelineStore
                                    |
                              HttpTimelineApi  ->  REST handler  ->  TimelineService
```
- The workspace only talks to `TimelineApi`. It never validates or persists anything itself.
- `TimelineService` holds every business rule: validation, integrity across records, cascades, metrics.
- Stores only store. They return copies and hold no rules.

### Key Folders
| Folder | Role |
|---|---|
| `src/core/` | Domain: enums, models, catalog, validation, metrics, service, persistence port. No DOM, no Node. |
| `src/storage/` | Browser side stores and the HTTP client. No Node. |
| `src/ui/` | Workspace, panels, renderers, theme, export. No Node. |
| `src/server/` | Node only: REST handler, static server, SQL store, SQLite driver, CLI. |
| `styles/` | The one stylesheet. Every colour is a `--tlg-*` token. |
| `tests/` | `node:test` suites. `tests/storage/store-contract.ts` binds every store. |
| `docs/` | REST contract, storage and integration guides. |
| `app/` | The incident app pages served by the reference server, or by any static host. |

---

## Coding Rules

### Core Principle
- Identify and fix the root cause. Do not patch symptoms or add workarounds.
- No hacks, tricks, or clever shortcuts. Write straightforward, maintainable code.
- If the fix requires changing multiple layers or refactoring, do it. Do not compromise on correctness.

### Style
- Follow existing patterns in the codebase before introducing new ones.
- New representations use `defineRenderer` and the shared `frame`, `cards` and `svg` helpers.
- New stores implement `TimelineStore` and join the store contract tests.

### Typing and Explicitness
- No `any`. No `as` casts. No non-null assertions (`!`). Use type guards and narrowing instead.
- Use known interfaces, classes, string enums or generic type parameters instead of weak placeholders.
- Avoid reflection and dynamic inspection unless strictly necessary and no typed alternative exists.
- Give exported functions and methods explicit return types.
- Do not model data as loose string constants or string dictionaries. Declare an interface, class or enum
  so the compiler carries the shape. Reserve string records for external contracts such as HTTP headers,
  SVG attributes or stored JSON.

### Mapping
- Records become diagram shapes in `src/core/mapping.ts` only, by omitting fields rather than copying them
  one by one, so adding a field touches the model and nothing else.

### Simplicity
- **Don't over-engineer.** Write the simplest code that satisfies the requirement.
- Avoid unnecessary abstractions, layers, or generics unless reuse is certain.

### Syntax
- Do not use expression-bodied arrows for exported functions, class methods or anything holding real logic.
  Use block bodies with explicit `return`.
- Short arrows are fine for callbacks, trivial helpers and single expressions.

### Comments
- Only write comments that contextualize non-obvious behavior or explain *why*, never *what*.
- Do not narrate the code, restate it, or document the act of changing it.
- Do not break the fourth wall or address the reader as if reporting.
- Do not count steps or phases in comments.
- No unicode characters in comments. Plain ASCII only.
- Say one thing per comment.

### Error handling
- Validate at system boundaries: the REST handler, the service inputs, stored JSON and database rows.
- Do not add defensive checks for scenarios that cannot happen.
- Do not swallow exceptions silently. A refused browser storage write is the only accepted, commented case.

### Security (by design)
- Never assign `innerHTML`. Build elements through the DOM and set text through `textContent`.
- Never trust client supplied ids: every record operation checks the record belongs to the incident named.
- Every SQL value is a bound parameter. Never splice input into SQL.
- Keep the browser folders free of Node imports; a test enforces it.
- No secrets in code or tracked config.

### Quality
- **Zero warnings, zero errors.** `npm run typecheck` and `npm test` must pass.
- New public methods of the service, stores or HTTP layer need a test.
- **No hardcoded values.** Name numbers and strings as constants or enums. In tests, extract repeated values
  to constants at file level.

---

## Thinking Rules

### Stay on target
- Before writing code, restate the goal in one sentence and check it matches the request.
- Regularly ask whether a step directly advances the goal. If not, re-orient.

### Avoid thinking loops
- If you solve the same sub-problem twice, stop and pick one solution.
- If stuck after two approaches, ask rather than guess a third.

### Ask when unclear
- Ask before architectural decisions that affect several layers or the public API.
- Ask before touching validation, authorization hooks or the static server if the intent is ambiguous.

### Be brief
- No over-explanation. State what was done and why if non-obvious, then stop.

---

## Response Style

- No unicode characters. Plain ASCII.
- Write like a human, grammatically correct, no robotic phrasing.
- No dashes in sentences. Use commas, periods, or restructure.
- Say things once.

---

## Commit Messages

- One single line. No body, no trailer, no AI attribution.
- Plain ASCII only.
- Format `type(scope): plain english sentence`, lowercase after the colon.
- Types: `feat`, `fix`, `refactor`, `perf`, `style`, `docs`, `test`, `misc`.
- Say what the change does for the product, not which files were touched.

---

## Workflow Rules

- Always read the relevant code before modifying it.
- Run `npm test` before considering a change done.
- A change to the REST contract updates `docs/rest-api.md`, `HttpTimelineApi` and the handler together.
- A change to a stored field updates `src/server/sql/schema.ts`, `schema/postgres.sql` and the store contract.
