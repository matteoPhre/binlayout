# @matteophre/binlayout — ROADMAP

This document is the implementation roadmap for the library. It is written to be executed
by coding agents: each phase has a closed scope, a target API, verifiable acceptance
criteria, and — where needed — open technical decisions that must be resolved **before**
implementation begins (not during).

Non-negotiable principles (apply to every phase):
- zero runtime dependencies
- no implicit behavior (endianness, dynamic sizing, padding: always explicit)
- no `any`, type inference always derived from the layout definition
- every performance claim (e.g. "zero-alloc", "O(1)") must be backed by a test that
  proves it, not just a comment in the code

---

## Phase 0 — Core primitives (fast path)

**Goal**: foundation of the fast path. No dynamic features.

**Deliverables**:
- Primitives: `u8()`, `u16()`, `u32()`, `i8()`, `i16()`, `i32()`, `f32()`, `f64()`
- Explicit endianness on every numeric primitive: `u32({ endian: 'le' | 'be' })`,
  with the default explicitly documented (never "implicit")
- `object({...})` with compile-time-computed offsets
- `layout.size` as a constant (static property, not a function)
- `layout.encode(obj): Uint8Array` and `layout.decode(buf): T` in a single pass

**Acceptance criteria**:
- `size(Header)` must be resolvable at compile time (test via `expectTypeOf`)
- benchmark: `encode`/`decode` with zero intermediate allocations beyond the final
  object and the output buffer (measured, not assumed)
- round-trip test: `decode(encode(x)) === x` on fixtures generated for every primitive
  type, including overflow/underflow at range limits

**Decisions to make before implementing**:
- Behavior on numeric overflow during encode (throw vs. truncate) — must be explicit
  and documented, never a silent default

---

## Phase 1 — Dynamic layouts (slow path)

**Goal**: introduce runtime variability while keeping full explicitness.

**Deliverables**:
- `bytes('fieldName')` — dynamic length referencing an already-read field
- `bytes({ length: 'dynamic', prefix: u16() })` — explicit length-prefixed form
- `array(itemLayout, { length: 'fieldName' | number })`
- `layout.computeSize(obj): number` — mandatory for every dynamic layout

**Acceptance criteria**:
- `computeSize` must be callable with no side effects (pure function)
- explicit error (not a silent crash) if a length field references a non-existent
  or type-incompatible field — see Phase 6 for the error model
- benchmark kept separate from Phase 0's: here zero-alloc is NOT guaranteed, the real
  cost (single-pass vs. two-pass) is measured and documented instead

**Decisions to make before implementing**:
- **Scope of the zero-alloc guarantee**: must be explicitly stated that zero-alloc is
  a fast-path (Phase 0) property and does not automatically extend here. Every later
  feature (checksum, conditional) must declare whether it breaks this guarantee.

---

## Phase 2 — Bit-level layout and alignment

**Goal**: bit-level packing and explicit control over padding.

**Deliverables**:
- `bitfield({ field: bits, ... })` with explicit bit order: `bitfield({...}, { order: 'lsb' | 'msb' })`
- `padding(n)` as an explicit, semantically nameless field
- `u32({ align: n })` as a declarative alternative to manual padding

**Acceptance criteria**:
- explicit interaction tests: a bitfield followed by a byte-aligned field, a bitfield
  that doesn't fill its last byte followed by another bitfield
- **composition rule to be documented in code and JSDoc**: what happens when a bitfield
  doesn't consume a whole number of bytes and the next field is a byte-aligned
  primitive — this must fail explicitly at layout definition time (compile-time if
  possible, otherwise at runtime with a clear error), never silently round up

**Decisions to make before implementing**:
- Precedence between bitfield order and object-level endianness when a bitfield spans
  more than one byte (e.g. a 12-bit field across 2 bytes)

---

## Phase 3 — Partial decoding (`pick`) and the Cursor API

**Goal**: resolve the overlap identified during design between `pick` and the Cursor,
before exposing two public APIs that solve the same problem differently.

**Architectural decision to lock in as the first task of this phase (not optional)**:
Choose one of:
1. Cursor is the primitive building block; `pick` becomes syntactic sugar built on top
   of it (`decode(buf, { pick: [...] })` internally creates a cursor and reads only the
   requested fields)
2. `pick` and Cursor remain distinct APIs for distinct use cases — in this case the
   docs must explicitly state when to use one vs. the other (e.g. `pick` for "I already
   know which fields I need", Cursor for streaming/dispatch where which fields to read
   depends on values read at runtime)

Implementation of both must not proceed until this decision is written into the README
as part of the public API design.

**Cursor deliverables**:
- `layout.cursor(buffer)` → object with `.read(path)`, `.skip(fieldName)`
- Statically typed paths **only after a feasibility spike** (see below)

**`pick` deliverables** (if it survives as a distinct API):
- `layout.decode(buffer, { pick: ['a', 'b'] })`
- must respect layout order and fail explicitly if a picked field depends on a dynamic
  field that isn't included in the pick (e.g. `pick: ['payload']` without
  `pick: ['length']` when `payload` depends on `length`)

**Mandatory spike before the Cursor deliverable**:
- Prototype typed paths (`'header.sequence'`) on a layout with at least 3 nesting levels
  and an array. Measure TS compile time on a realistically sized project (not just the
  minimal design-doc example). If compile cost is prohibitive, the phase must produce an
  alternative (e.g. tuple paths `['header','sequence']` instead of string literals, or
  type generation via codegen instead of pure inference)

**Acceptance criteria**:
- zero unnecessary allocations for `.skip()` (must only advance the offset, not read
  the bytes)
- idempotency: calling `.read(path)` twice on the same path returns the same value
  without advancing the cursor twice

---

## Phase 4 — Conditional layouts

**Goal**: a layout whose shape depends on an already-read field.

**Deliverables**:
- `conditional('discriminantField', { value1: layoutA, value2: layoutB })`
- Return type inferred as a discriminated union based on the mapped values

**Acceptance criteria**:
- type test: `decode()` on a `conditional` returns a type that TypeScript correctly
  narrows after a check on the discriminant
- explicit error (see Phase 6) if the discriminant value has no mapped layout —
  no silent fallback

**Decisions to make before implementing**:
- How `computeSize` behaves on a conditional during encoding, when the input object has
  no buffer to read the discriminant from (the object is already in memory, the
  discriminant is a plain JS field — it doesn't need to be re-read, this just needs to
  be explicitly specified in the function's contract)

---

## Phase 5 — Checksum support

**Goal**: add checksum support while keeping the costs it introduces explicit.

**Deliverables**:
- `withChecksum(layout, { field: 'crc', algorithm: crc16 })`

**Acceptance criteria**:
- explicit documentation (README + JSDoc): any layout wrapped in `withChecksum` becomes
  two-pass during encoding, **even if the underlying layout is fast path**. This must
  also be reflected in the benchmark: a test must show the cost difference between the
  same layout with and without `withChecksum`
- `algorithm` is a pluggable interface (`{ compute(bytes: Uint8Array): number }`), not
  hardcoded to crc16, to stay framework-agnostic

---

## Phase 6 — Error handling model

**Goal**: define a consistent error model, used by all previous phases (retroactively,
if already implemented).

**Architectural decision**:
Choose between:
1. Exception-based model with typed error classes (`BinLayoutError`,
   `BufferTooShortError`, `InvalidDiscriminantError`, etc.)
2. Result/discriminated-union model (`{ ok: true, value } | { ok: false, error }`)
   consistent with the style already used in `@matteophre/gatekeeper-policies`

**Deliverables** (regardless of the choice):
- Explicit coverage of: buffer too short, dynamic length field exceeding buffer bounds,
  unmatched `conditional` discriminant, alignment violation as defined in Phase 2
- No error may be silently swallowed or masked by a default value

**Acceptance criteria**:
- a test for each of the above cases using purpose-built malformed buffers
- no untyped exception (`throw new Error('...')` generic) exposed from the public API

---

## Phase 7 — Composition hooks

**Goal**: allow extensions (encryption, transport) without violating the architectural
boundaries defined in the design doc.

**Deliverables**:
- `interface ByteTransform { encode(data: Uint8Array): Uint8Array; decode(data: Uint8Array): Uint8Array }`
- `layout.encode(obj, { transform })` / `layout.decode(buf, { transform })`

**Acceptance criteria**:
- test proving the transform hook has no access to the layout structure, only to raw
  bytes (guarantee of layer separation)

---

## Phase 8 — Streaming parser (future, optional)

**Goal**: handle partial buffers for streaming/protocol use cases over unreliable
transports (e.g. serial, as in Keydom/Starnet).

**Deliverables**:
- `createStreamParser(layout)` with `.push(chunk)` emitting complete frames

**Note**: this phase is explicitly deferrable. It should not start until Phases 0-2 are
stable, since a correct streaming parser depends on `computeSize` and the error model
already being settled.

---

## Recommended execution order for agents

```
Phase 0 → Phase 1 → Phase 2 → Phase 6 (error model, must be decided early)
        → Phase 3 (pick/cursor decision + typing spike) → Phase 4 → Phase 5
        → Phase 7 → Phase 8 (optional, only once the foundation is stable)
```

Phase 6 is moved earlier than its "natural" order because every subsequent phase
references it for error handling — it needs to be decided upfront, not retrofitted.