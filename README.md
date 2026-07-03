# @matteophre/binlayout

Zero-dependency TypeScript library for deterministic binary message parsing and validation.

> **Note on "zero-alloc":** This library prioritizes correctness and flexibility. JavaScript objects inherently allocate memory. For true zero-alloc requirements, use `parseInto()` with a pre-allocated target object in a hot path, where numeric fields won't allocate additional memory. The `bytes` fields will always create Uint8Array views, which are necessary for safe data access.


## Objective

Define binary message structures declaratively, extract and validate fields from raw buffers with native TypeScript typing, and delegate transport-specific framing to separate modules.

## Installation

```bash
npm install @matteophre/binlayout
```

## Quick Start

### Define a schema, compile it, and parse a buffer:

```ts
import { compileSchema, crc16Ccitt } from '@matteophre/binlayout';

// Define the binary message structure
const schema = {
  name: 'ModbusRTUMessage',
  endianness: 'LE' as const, // Little Endian by default
  fields: [
    { name: 'slaveId', type: 'uint8' as const },
    { name: 'functionCode', type: 'uint8' as const },
    { name: 'startAddr', type: 'uint16' as const },
    { name: 'quantity', type: 'uint16' as const },
    { name: 'crc', type: 'uint16' as const },
  ] as const,
} as const;

// Compile the schema once (this calculates offsets and generates optimized readers)
const compiled = compileSchema(schema);

// Parse a buffer
const buffer = new Uint8Array([
  0x01,           // slaveId
  0x03,           // functionCode
  0x00, 0x00,     // startAddr (0x0000 LE)
  0x00, 0x0A,     // quantity (0x0A00 LE = 10 LE, but reads as 0x0A = 10)
  0x44, 0x39,     // crc (example)
]);

const message = compiled.parse(buffer);
console.log(message);
// Output: { slaveId: 1, functionCode: 3, startAddr: 0, quantity: 2560, crc: 14660 }
```

### Type inference — no manual annotations needed:

```ts
// The inferred type includes all fields with correct types
type Message = typeof message; // { slaveId: number; functionCode: number; ... }
```

### Validation with CRC16:

```ts
const payloadBuffer = buffer.slice(0, -2); // all except CRC bytes
const expectedCrc = (buffer[5]! << 8) | buffer[4]!; // CRC in BE

const isValid = crc16Ccitt.verify(payloadBuffer, expectedCrc);
console.log(isValid); // true/false
```

### Variable-length fields:

```ts
const variableSchema = {
  name: 'VarMsg',
  endianness: 'LE' as const,
  fields: [
    { name: 'len', type: 'uint8' as const },
    { name: 'payload', type: 'bytes' as const, lengthFrom: 'len' as const },
  ] as const,
} as const;

const compiled = compileSchema(variableSchema);
const buffer = new Uint8Array([0x03, 0xAA, 0xBB, 0xCC]);
const msg = compiled.parse(buffer); // { len: 3, payload: Uint8Array([0xAA, 0xBB, 0xCC]) }
```

## Supported types

- **Numeric**: `uint8`, `uint16`, `uint32`, `int8`, `int16`, `int32`, `float32`, `float64`
- **Binary**: `bytes` (raw Uint8Array, fixed or variable-length)
- **String**: `ascii` (decoded as string, fixed or variable-length)

## Features

- **Zero dependencies**: uses only Node.js built-ins and TypeScript stdlib.
- **Zero allocations in hot path**: `parse()` creates only the output object; `parseInto()` reuses a target object.
- **Deterministic**: identical input + schema = identical output, always.
- **Full TypeScript support**: strict mode, no `any`, explicit types inferred from schema.
- **Flexible endianness**: per-schema default or per-field override.
- **Variable-length fields**: fields can depend on previous numeric fields.
- **Validation strategies**: built-in CRC16, CRC32, Checksum8 (pluggable).

## Architecture

- **Core** (`schema`, `parser`, `types`): schema definition and zero-alloc parsing
- **Validation** (`strategies`): pluggable validation (CRC/Checksum)
- **Framing** (`framer`): interface contract only; transport-specific implementations go in separate modules

## License

MIT
