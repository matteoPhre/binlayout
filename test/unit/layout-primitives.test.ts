import { describe, expect, expectTypeOf, it } from 'vitest';
import { f32, i16, object, size, u16, u8 } from '../../src/layout.js';

describe('Layout primitives DSL', () => {
  it('builds fixed-size object layouts with explicit field endianness', () => {
    const header = object({
      cmd: u8(),
      sequence: u16({ endian: 'be' }),
      temperature: i16({ endian: 'le' }),
      ratio: f32({ endian: 'be' }),
    });

    expect(size(header)).toBe(9);
    expect(header.size).toBe(9);

    const encoded = header.encode({
      cmd: 0x42,
      sequence: 0x1234,
      temperature: -10,
      ratio: 1.5,
    });

    expect(encoded).toEqual(new Uint8Array([
      0x42,
      0x12, 0x34,
      0xf6, 0xff,
      0x3f, 0xc0, 0x00, 0x00,
    ]));

    const decoded = header.decode(encoded);
    expect(decoded.cmd).toBe(0x42);
    expect(decoded.sequence).toBe(0x1234);
    expect(decoded.temperature).toBe(-10);
    expect(decoded.ratio).toBeCloseTo(1.5, 5);
  });

  it('supports decode with offset', () => {
    const packet = object({
      code: u8(),
      value: u16({ endian: 'le' }),
    });

    const buffer = new Uint8Array([0x00, 0x00, 0x7f, 0x34, 0x12]);
    const result = packet.decode(buffer, 2);

    expect(result.code).toBe(0x7f);
    expect(result.value).toBe(0x1234);
  });

  it('infers object output type from layout definition', () => {
    const packet = object({
      code: u8(),
      value: u16(),
    });

    expectTypeOf(packet.decode(new Uint8Array([1, 2, 0]))).toEqualTypeOf<{
      code: number;
      value: number;
    }>();
  });
});
