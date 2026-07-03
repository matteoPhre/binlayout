# AGENTS.md — `@matteophre/binlayout`

This file guides any AI agent (Copilot, Claude Code, or other) writing code in this repository. The rules here take precedence over any tool default. When delivery speed and code quality conflict, quality wins.

## Mindset

Write code the way a senior software engineer would, expecting to maintain it for years — not a throwaway prototype. This means:

- Every design choice has an explicit reason, not "seemed fine at the time."
- The code reads like prose: whoever opens it for the first time understands the intent without having to mentally reconstruct context.
- Don't add "for the future" abstractions that aren't required by a use case present in the spec. YAGNI matters as much as DRY.
- If a function needs a comment to be understood, first try making it clearer through naming/structure; comments explain *why*, never *what*.

## Clean Architecture — non-negotiable rules

- **Dependency Rule**: dependencies always point inward. The core (`schema`, `parser`, `types`) never knows about and never imports anything from `framing/adapters/*`. If you find that a core type needs to know something about a specific transport, the design is wrong: stop and redesign the interface instead of working around it with a direct import.
- Every module has a single responsibility and a single reason to change (SRP). If a file exceeds ~200 lines, ask yourself whether it's doing more than one thing.
- Interfaces (`Framer`, `ValidationStrategy`) are stable contracts: a concrete implementation must never expose methods or fields that aren't part of the declared public interface.
- No cyclic dependencies between modules, ever. If the import graph forms a cycle, it's an architectural bug to fix immediately, not to suppress.
- Composition over inheritance: there is almost never a need for class hierarchies here — prefer pure functions and composition of small, testable units.

## TypeScript — typing

- **Zero `any`** in public code. If a type is genuinely unknown, use `unknown` and narrow it explicitly.
- No casts (`as X`) to silence a compiler error, except for the cases already anticipated and documented in the spec (e.g. `as const` on `FieldDef` arrays). Any other cast is a signal that the upstream type is wrong: trace it back and fix it there.
- `strict: true` in `tsconfig.json`, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — never disable these just to make the compiler pass faster.
- Public exported types must be self-explanatory: if a user has to open the source to understand what a function returns, the type isn't explicit enough.
- Prefer discriminated unions over multiple boolean flags to represent mutually exclusive states (e.g. a parse outcome: success vs. error, not `{ ok: boolean, error?: ... }`).
- Naming: `PascalCase` for types/interfaces, `camelCase` for functions/variables, `UPPER_SNAKE_CASE` only for true immutable module-level constants. No cryptic abbreviations (`cfg`, `tmp`, `res` are banned when the full name is clear and short).

## Error handling

- Never `throw` plain strings or generic objects: only typed error classes (see `errors.ts` in the spec), with structured fields (offset, field, cause) that a catcher can use programmatically, not just log.
- A function that can fail "expectedly" (e.g. buffer too short) declares the error in its return type or throws in a documented way via JSDoc — never fail silently with untyped `undefined`/`null`.
- Don't catch exceptions just to ignore them or `console.log` them. If a `catch` has no real recovery action, it shouldn't exist.

## Testing

- Test behavior, not implementation: if you refactor a function without changing its public API, existing tests must keep passing unchanged.
- Every bug fix comes with a test that fails before the fix and passes after — no exceptions.
- The edge cases listed in the spec (§4.4) are not optional: each one has a dedicated test with an explicit name describing the scenario, not `test('edge case 1')`.
- No filesystem or I/O mocking to test the core: since it's pure and synchronous, tests are direct calls with in-memory buffers/fixtures.

## What NOT to do

- Don't introduce runtime dependencies "just for this small thing" — if a library seems necessary, stop and propose the zero-dep alternative before adding it.
- Don't prematurely optimize parts that aren't on the hot path (legacy framing, error generation) at the expense of readability — optimization (zero-alloc) is required only where the spec explicitly demands it (parser/parseInto).
- Don't leave `TODO`s or `FIXME`s without a linked issue or an explanation of why it wasn't resolved immediately.
- Don't copy patterns from other libraries (e.g. Kaitai Struct, protobufjs) without adapting them to this project's explicit constraints (zero-dep, zero-alloc, Raspberry Pi CM3+ target).

## Before considering a task done

- Clean `tsc --noEmit`, zero warnings.
- Clean linter run.
- Tests added for every new behavior, suite green.
- No `any`, no unjustified casts, no new runtime dependency that wasn't discussed.
- The written code follows the order of the incremental plan in `SPEC.md` §9 — don't jump ahead to later features while leaving behind tests or edge cases from the current step.