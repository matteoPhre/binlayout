import { describe, expect, it } from 'vitest';
import { bitfield, object, padding, u8, u16, u32 } from '../../src/layout.js';
import { SchemaEncodeError } from '../../src/errors.js';

describe('Layout Phase 2 - bitfield and alignment', () => {
  it('encodes and decodes bitfield in lsb order', () => {
    const layout = object({
      flags: bitfield({ mode: 3, enabled: 1, code: 4 }, { order: 'lsb' }),
    });

    const encoded = layout.encode({
      flags: { mode: 0b101, enabled: 1, code: 0b1100 },
    });

    const decoded = layout.decode(encoded);
    expect(decoded.flags).toEqual({ mode: 0b101, enabled: 1, code: 0b1100 });
  });

  it('allows consecutive bitfields without silent byte rounding', () => {
    const layout = object({
      first: bitfield({ a: 3 }, { order: 'msb' }),
      second: bitfield({ b: 5 }, { order: 'msb' }),
    });

    const encoded = layout.encode({
      first: { a: 0b101 },
      second: { b: 0b10011 },
    });

    const decoded = layout.decode(encoded);
    expect(decoded.first.a).toBe(0b101);
    expect(decoded.second.b).toBe(0b10011);
  });

  it('fails at layout definition when byte field follows partial bitfield', () => {
    expect(() => object({
      flags: bitfield({ mode: 3 }),
      value: u8(),
    })).toThrow(SchemaEncodeError);
  });

  it('supports explicit padding and align on primitives', () => {
    const layout = object({
      a: u8(),
      gap: padding(1),
      b: u32({ align: 4, endian: 'le' }),
      c: u16({ endian: 'be' }),
    });

    const encoded = layout.encode({
      a: 1,
      b: 0x11223344,
      c: 0xabcd,
    });

    // a(1) + padding(1) + align to 4 => b starts at offset 4
    expect(encoded.length).toBe(10);

    const decoded = layout.decode(encoded);
    expect(decoded.a).toBe(1);
    expect(decoded.b).toBe(0x11223344);
    expect(decoded.c).toBe(0xabcd);
  });
});
