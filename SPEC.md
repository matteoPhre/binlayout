# Technical Specification: `@matteophre/binlayout`

## 0. Project setup (to be done first)

- Package name: **`@matteophre/binlayout`**.
- Create a new Git repository (`git init`), suggested repo name: `binlayout`.
- Initialize `package.json` with:
  - `"name": "@matteophre/binlayout"`
  - `"version": "0.1.0"`
  - `"type": "module"` (ESM, consistent with the maintainer's other TS libraries)
  - `"license": "MIT"` (or preferred license, to be confirmed)
  - `"main"`/`"types"` pointing to the build output in `dist/`
  - `"dependencies": {}` — empty, by design (see §7)
  - `"devDependencies"`: TypeScript, test runner (e.g. `vitest` or native `node:test`), linter
  - `"files"`: only `dist/` and `README.md`, so sources/tests aren't published to the npm package
- Add `tsconfig.json` in strict mode (see §7).
- Add `.gitignore` (`node_modules/`, `dist/`, test logs).
- First commit: empty folder structure from §3 + `package.json` + `tsconfig.json` + this `SPEC.md` in the repo (e.g. in root or `/docs`), so it remains as a persistent reference for later implementation work.
- Initial README with only a title, a one-line goal statement, and a placeholder "Usage" section to be filled in at the end of §9.

## 1. Project goal

**Zero-dependency**, **zero runtime allocation on the hot path**, **deterministic** TypeScript library for:
1. declaratively defining the structure of a binary message;
2. extracting (parsing) fields from a buffer with native typing via Generics;
3. validating payload integrity through pluggable CRC/Checksum strategies;
4. delegating framing (finding message boundaries in a stream) to separate, transport-specific modules.

The package must NOT know about the concepts of any specific protocol (RS485, TCP, MQTT...). It is a generic "binary schema → typed object" engine.

## 2. 4-layer architecture (mandatory)

```
┌─────────────────────────────────────────────┐
│  4. Typing Layer (Generics)                  │  compiles Schema -> TS type
├─────────────────────────────────────────────┤
│  3. Validation Strategies (CRC/Checksum)     │  pure, pluggable functions
├─────────────────────────────────────────────┤
│  2. Schema Engine (core, stateless)          │  Schema + Buffer -> values
├─────────────────────────────────────────────┤
│  1. Framer (stateful, per-transport)         │  Uint8Array chunks -> Frame[]
└─────────────────────────────────────────────┘
```

Each layer is an independent module, importable separately (no barrel file that forces loading everything). The core (layers 2+3+4) must NEVER import anything from layer 1.

## 3. Package structure

```
/src
  /core
    schema.ts          // Schema, FieldDef type definitions
    parser.ts          // compileSchema(), parse()
    types.ts           // InferSchemaType<T> (mapped/conditional types)
  /validation
    strategies.ts       // ValidationStrategy interface
    crc16.ts, crc32.ts, checksum8.ts   // built-in implementations
  /framing
    framer.ts           // Framer interface (contract only, no transport-specific implementation in the core package)
  /errors.ts             // typed error classes
  index.ts
/test
  /unit
  /fixtures            // sample binary buffers as .bin files or hex strings
```

Concrete `Framer` implementations for RS485/TCP/MQTT go in separate packages or entry points (`/src/framing/adapters/*`), NOT in the core, to preserve the zero-dependency-per-use-case principle: someone who only needs the parser should never have to import framing logic.

## 4. Layer 2 — Schema Engine (the core, highest implementation priority)

### 4.1 Schema definition

```ts
type Endianness = 'BE' | 'LE';

type PrimitiveType =
  | 'uint8' | 'uint16' | 'uint32'
  | 'int8'  | 'int16'  | 'int32'
  | 'float32' | 'float64'
  | 'bytes'   // raw slice, fixed or dynamic length
  | 'ascii';  // fixed-length or terminated string

interface FieldDef<Name extends string = string> {
  name: Name;
  type: PrimitiveType;
  endianness?: Endianness;        // defaults to schema-level setting
  length?: number;                // for fixed-length 'bytes'/'ascii'
  lengthFrom?: string;            // name of a prior field holding the length (for variable-length fields)
  offset?: number;                // explicit, or computed sequentially by the compiler
}

interface SchemaDef<Fields extends readonly FieldDef[] = readonly FieldDef[]> {
  name: string;
  endianness: Endianness;         // global default
  fields: Fields;
}
```

### 4.2 Compilation (key requirement for "zero-alloc")

The schema must NOT be interpreted on every parse call. There must be a **one-time compilation** step:

```ts
declare function compileSchema<const S extends SchemaDef>(
  schema: S
): CompiledSchema<S>;

interface CompiledSchema<S extends SchemaDef> {
  readonly byteLength: number | null;  // null if variable
  parse(buffer: Uint8Array, offset?: number): InferSchemaType<S>;
  parseInto(buffer: Uint8Array, target: InferSchemaType<S>, offset?: number): InferSchemaType<S>; // reuses the target object, true zero-alloc for high-frequency polling
}
```

`compileSchema` precomputes: each field's offset (statically where possible), specialized read functions per type/endianness (avoid repeated `switch` statements on the hot path — use pre-resolved closures generated per field at compile time).

### 4.3 Typing via Generics (Layer 4, but depends on 4.1)

```ts
type FieldTSType<F extends FieldDef> =
  F['type'] extends 'bytes' ? Uint8Array :
  F['type'] extends 'ascii' ? string :
  number; // all integer/float types map to number

type InferSchemaType<S extends SchemaDef> = {
  [F in S['fields'][number] as F['name']]: FieldTSType<F>
};
```

Requirement: `compileSchema({ fields: [{name: 'cmd', type: 'uint8'}, ...] } as const)` must produce, in the IDE, a return type with the correct keys and types WITHOUT any manual annotation from the user. Requiring `as const` on the fields array is an acceptable constraint and should be documented.

### 4.4 Edge cases that must be explicitly handled (do not ignore)

- A variable-length field that depends on a prior field (`lengthFrom`) → the schema's total `byteLength` is `null`, and the parser must read progressively.
- Buffer shorter than required → throw a typed `SchemaParseError` with the offset and field that caused the failure; never silently read out of bounds or return untyped `undefined`.
- Fields with explicit overlapping offsets → error at `compileSchema` time, not at parse runtime (fail fast at boot).
- Mixed endianness per individual field vs. schema-level default.
- Bit-fields / sub-byte fields (e.g. 3 bits for a flag inside a uint8): decide whether a dedicated `FieldDef` type `type: 'bitfield'` with `bits: number` is needed — decide EXPLICITLY whether this is in scope for v1 or not (see §7).

## 5. Layer 3 — Validation Strategies

```ts
interface ValidationStrategy {
  readonly name: string;
  compute(data: Uint8Array): number | Uint8Array;   // computed value
  verify(data: Uint8Array, expected: number | Uint8Array): boolean;
}
```

- Required built-in implementations: `crc16Ccitt`, `crc32`, `checksum8Xor`, `checksum8Sum`.
- Must be pure functions, no side effects, no allocations beyond the eventual scalar return value.
- Integration with the schema is optional and decoupled: a `CompiledSchema` may accept a `ValidationStrategy` plus the byte range it applies to (e.g. "everything except the last field"), but the validation engine must also work standalone, without a Schema.

## 6. Layer 1 — Framer (contract, not implemented in the core)

```ts
interface Framer {
  feed(chunk: Uint8Array): Frame[];   // may return 0, 1, or more complete frames
  reset(): void;                       // for resync after an error
}

interface Frame {
  readonly data: Uint8Array;   // view into the internal buffer, not a copy where avoidable
  readonly timestamp: number;
}
```

The core does NOT implement `LengthPrefixedFramer`, `DelimiterFramer`, etc. — these are separate, optional modules that consume `Framer`, so someone who only works with already-framed serial buses (as in the Keydom/SerialDriver case, where application-level framing already exists elsewhere) can ignore this layer entirely.

## 7. Non-functional requirements

- **Zero runtime dependencies**: nothing in `dependencies`. `devDependencies` are unrestricted (test runner, tsc, linter).
- **Zero allocations on the hot path**: after `compileSchema`, repeated calls to `parse`/`parseInto` must not create closures, temporary arrays, or intermediate objects other than the result. Validate this with a micro-benchmark that measures allocations (e.g. `--expose-gc` + `process.memoryUsage()` before/after N iterations) as part of the test suite, not just as a claim.
- **Deterministic**: same binary input + same schema → same output, always. No use of `Date.now()`, `Math.random()`, or global state inside the core (the `timestamp` lives in the Framer, not the core).
- **Target runtime**: must run on Node on Raspberry Pi CM3+ (ARM, constrained resources) — so also be careful not to generate code that forces V8 deopts (e.g. mixed types in arrays, non-monomorphic function calls where avoidable).
- **TypeScript strict mode** is mandatory, no `any` in the public API.

## 8. Out of scope for v1 (explicit, to avoid scope creep)

- No MQTT/TCP/RS485 framing support in the core package.
- No sub-byte bit-field support in v1 (decide whether to add it in v2 after validating the API on byte-aligned fields).
- No async API: parsing and validation are synchronous, the buffer is already in memory.
- No support for recursive/nested schemas in v1 (a field that is itself another Schema) — only flat primitive fields. Consider nesting as v2 if needed.

## 9. Incremental implementation plan (recommended order for Copilot)

0. Repo and `package.json` setup per §0.
1. `errors.ts` + base types in `schema.ts`.
2. `parser.ts`: `compileSchema` + `parse` for **fixed-length-only** schemas, no `lengthFrom`. Unit tests with known binary fixtures.
3. `types.ts`: mapped types for inference; verify in the IDE that `parse()` returns the correct types.
4. Extend `parser.ts` for variable-length fields (`lengthFrom`).
5. `parseInto` for the zero-alloc mode with a reused object.
6. `validation/strategies.ts` + CRC16/CRC32/Checksum8, tested against published, well-known test vectors (not invented ones).
7. Optional validation + schema integration.
8. `Framer` contract (interface only, no transport implementation in the core).
9. Allocation micro-benchmark + performance benchmark on a realistic dataset.

## 10. Acceptance criteria

- Unit test coverage ≥ 90% on `core` and `validation`.
- No runtime dependencies in `package.json`.
- Benchmark demonstrating 0 additional allocations over 10,000 consecutive calls to `parseInto` with the same compiled schema.
- End-to-end usage example in the README: schema definition, compile, parsing a hex buffer, CRC validation, with the inferred type visible without explicit annotations.