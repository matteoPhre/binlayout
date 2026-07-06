# @matteophre/binlayout

Zero-dependency TypeScript library for deterministic binary message parsing and validation.

> **Note on "zero-alloc":** In JavaScript, fully zero-allocation parsing is generally not realistic. `parseInto()` can reduce allocations by reusing the target object and is the lowest-allocation path for numeric fields. `parse()` allocates a new result object per call. `bytes` fields create `Uint8Array` views, and `ascii` fields create strings.


## Objective

Define binary message structures declaratively, extract and validate fields from raw buffers with native TypeScript typing, and delegate transport-specific framing to separate modules.

## Installation

```bash
npm install @matteophre/binlayout
```

## Quick Start

### Define a schema, compile it, and parse a buffer:

```ts
import { compileSchema, defineSchema } from '@matteophre/binlayout';

// Define the binary message structure
const schema = defineSchema({
  name: 'ModbusRTUMessage',
  endianness: 'LE', // Little Endian by default
  fields: [
    { name: 'slaveId', type: 'uint8' },
    { name: 'functionCode', type: 'uint8' },
    { name: 'startAddr', type: 'uint16' },
    { name: 'quantity', type: 'uint16' },
    { name: 'crc', type: 'uint16' },
  ],
});

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

### Validation with an injected strategy (external package):

```ts
import { createValidationStrategy } from '@matteophre/binlayout';
import { crc16xmodem } from 'crc';

const crc16Strategy = createValidationStrategy<number>({
  name: 'crc16-xmodem',
  compute(data) {
    return crc16xmodem(Buffer.from(data)) & 0xffff;
  },
});

const payloadBuffer = buffer.slice(0, -2); // all except CRC bytes
const expectedCrc = (buffer[5]! << 8) | buffer[4]!; // CRC in BE

const isValid = crc16Strategy.verify(payloadBuffer, expectedCrc);
console.log(isValid); // true/false
```

### Variable-length fields:

```ts
const variableSchema = defineSchema({
  name: 'VarMsg',
  endianness: 'LE',
  fields: [
    { name: 'len', type: 'uint8' },
    { name: 'payload', type: 'bytes', lengthFrom: 'len' },
  ],
});

const compiled = compileSchema(variableSchema);
const buffer = new Uint8Array([0x03, 0xAA, 0xBB, 0xCC]);
const msg = compiled.parse(buffer); // { len: 3, payload: Uint8Array([0xAA, 0xBB, 0xCC]) }
```

### Transport framing + custom payload parser

If your protocol has a transport envelope plus an application payload (for example STX/ETX framing + embedded YSON/JSON), you can keep the layers separate:

```ts
import {
  decodeFramePayload,
  type Frame,
  type PayloadParser,
  type TransportFrameDecoder,
} from '@matteophre/binlayout';

type Header = {
  address: string;
  packetType: string;
  packetId: number;
};

const transportDecoder: TransportFrameDecoder<Header, Uint8Array> = {
  decode(frame: Frame) {
    const data = frame.data;
    return {
      header: {
        address: String.fromCharCode(data[1]!),
        packetType: String.fromCharCode(data[2]!),
        packetId: data[3]!,
      },
      payload: data.subarray(4, data.length - 3), // before checksum + ETX
    };
  },
};

const appPayloadParser: PayloadParser<Uint8Array, Record<string, unknown>> = {
  parse(payload) {
    return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
  },
};

const parsed = decodeFramePayload(frame, transportDecoder, appPayloadParser);
// parsed.header -> transport metadata
// parsed.payload -> typed application message
```

## Supported types

- **Numeric**: `uint8`, `uint16`, `uint32`, `int8`, `int16`, `int32`, `float32`, `float64`
- **Binary**: `bytes` (raw Uint8Array, fixed or variable-length)
- **String**: `ascii` (decoded as string, fixed or variable-length)

## Features

- **Zero dependencies**: uses only Node.js built-ins and TypeScript stdlib.
- **Low-allocation hot path**: `parseInto()` reuses a target object and avoids per-call result-object allocation.
- **Deterministic**: identical input + schema = identical output, always.
- **Full TypeScript support**: strict mode, no `any`, explicit types inferred from schema.
- **Flexible endianness**: per-schema default or per-field override.
- **Variable-length fields**: fields can depend on previous numeric fields.
- **Validation strategies**: dependency-free contracts for custom, injectable validators.
- **Pluggable payload parsing**: decode transport headers separately and pass a custom parser for application data.

## Architecture

- **Core** (`schema`, `parser`, `types`): schema definition and zero-alloc parsing
- **Validation** (`strategies`): pluggable validation (CRC/Checksum)
- **Framing** (`framer`): interface contract only; transport-specific implementations go in separate modules

## License

MIT
