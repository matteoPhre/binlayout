import { describe, expect, expectTypeOf, it } from 'vitest';
import { compileSchema } from '../../src/core/parser.js';
import { defineSchema } from '../../src/core/schema.js';
import type { InferSchemaType } from '../../src/core/types.js';

describe('Schema const generics', () => {
  it('preserves field names/types without as const', () => {
    const schema = defineSchema({
      name: 'NoConstAssertion',
      endianness: 'LE',
      fields: [
        { name: 'cmd', type: 'uint8' },
        { name: 'value', type: 'uint16' },
        { name: 'label', type: 'ascii', length: 2 },
      ],
    });

    type Parsed = InferSchemaType<typeof schema>;
    expectTypeOf<Parsed>().toEqualTypeOf<{
      cmd: number;
      value: number;
      label: string;
    }>();

    const compiled = compileSchema(schema);
    const result = compiled.parse(new Uint8Array([0x42, 0x34, 0x12, 0x4f, 0x4b]));

    expect(result.cmd).toBe(0x42);
    expect(result.value).toBe(0x1234);
    expect(result.label).toBe('OK');
  });

  it('supports direct compileSchema call without as const', () => {
    const compiled = compileSchema({
      name: 'DirectCompile',
      endianness: 'BE',
      fields: [
        { name: 'len', type: 'uint8' },
        { name: 'payload', type: 'bytes', lengthFrom: 'len' },
      ],
    });

    const parsed = compiled.parse(new Uint8Array([0x03, 0xaa, 0xbb, 0xcc]));

    expect(parsed.len).toBe(3);
    expect(parsed.payload).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]));
  });
});
