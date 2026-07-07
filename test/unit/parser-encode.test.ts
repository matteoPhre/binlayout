import { describe, expect, it } from 'vitest';
import { compileSchema } from '../../src/core/parser.js';
import { defineSchema } from '../../src/core/schema.js';
import { SchemaEncodeError } from '../../src/errors.js';

describe('Parser — encode + computeSize', () => {
  it('round-trip fixed fields with primitive limits', () => {
    const schema = defineSchema({
      name: 'RoundTripFixed',
      endianness: 'LE',
      fields: [
        { name: 'u8', type: 'uint8' },
        { name: 'u16', type: 'uint16' },
        { name: 'u32', type: 'uint32' },
        { name: 'i8', type: 'int8' },
        { name: 'i16', type: 'int16' },
        { name: 'i32', type: 'int32' },
        { name: 'f32', type: 'float32' },
        { name: 'f64', type: 'float64' },
        { name: 'tag', type: 'ascii', length: 2 },
        { name: 'raw', type: 'bytes', length: 3 },
      ],
    });

    const compiled = compileSchema(schema);

    const input = {
      u8: 0xff,
      u16: 0xffff,
      u32: 0xffff_ffff,
      i8: -0x80,
      i16: -0x8000,
      i32: -0x8000_0000,
      f32: 12.5,
      f64: -42.25,
      tag: 'OK',
      raw: new Uint8Array([0xaa, 0xbb, 0xcc]),
    };

    const encoded = compiled.encode(input);
    const decoded = compiled.parse(encoded);

    expect(decoded.u8).toBe(input.u8);
    expect(decoded.u16).toBe(input.u16);
    expect(decoded.u32).toBe(input.u32);
    expect(decoded.i8).toBe(input.i8);
    expect(decoded.i16).toBe(input.i16);
    expect(decoded.i32).toBe(input.i32);
    expect(decoded.f32).toBeCloseTo(input.f32, 5);
    expect(decoded.f64).toBeCloseTo(input.f64, 10);
    expect(decoded.tag).toBe(input.tag);
    expect(decoded.raw).toEqual(input.raw);
  });

  it('throws explicit error on integer overflow', () => {
    const schema = defineSchema({
      name: 'Overflow',
      endianness: 'LE',
      fields: [{ name: 'v', type: 'uint8' }],
    });

    const compiled = compileSchema(schema);
    expect(() => compiled.encode({ v: 256 })).toThrow(SchemaEncodeError);
  });

  it('computes dynamic size and round-trips variable bytes', () => {
    const schema = defineSchema({
      name: 'Var',
      endianness: 'LE',
      fields: [
        { name: 'len', type: 'uint8' },
        { name: 'payload', type: 'bytes', lengthFrom: 'len' },
      ],
    });

    const compiled = compileSchema(schema);
    const input = {
      len: 4,
      payload: new Uint8Array([1, 2, 3, 4]),
    };

    expect(compiled.computeSize(input)).toBe(5);

    const encoded = compiled.encode(input);
    const decoded = compiled.parse(encoded);

    expect(decoded.len).toBe(4);
    expect(decoded.payload).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('throws on variable field length mismatch', () => {
    const schema = defineSchema({
      name: 'VarMismatch',
      endianness: 'LE',
      fields: [
        { name: 'len', type: 'uint8' },
        { name: 'payload', type: 'bytes', lengthFrom: 'len' },
      ],
    });

    const compiled = compileSchema(schema);
    expect(() => compiled.encode({ len: 3, payload: new Uint8Array([1, 2]) })).toThrow(SchemaEncodeError);
  });
});
