import { describe, expect, it } from 'vitest';
import { array, bytes, object, u8, u16 } from '../../src/layout.js';
import { SchemaEncodeError, SchemaParseError } from '../../src/errors.js';

describe('Layout dynamic DSL (Phase 1)', () => {
  it('supports bytes(lengthFromField)', () => {
    const layout = object({
      len: u8(),
      payload: bytes('len'),
    });

    expect(layout.size).toBeNull();

    const encoded = layout.encode({
      len: 3,
      payload: new Uint8Array([0xaa, 0xbb, 0xcc]),
    });

    expect(encoded).toEqual(new Uint8Array([0x03, 0xaa, 0xbb, 0xcc]));

    const decoded = layout.decode(encoded);
    expect(decoded.len).toBe(3);
    expect(decoded.payload).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]));
    expect(layout.computeSize({ len: 3, payload: new Uint8Array([1, 2, 3]) })).toBe(4);
  });

  it('supports bytes({ length: dynamic, prefix: u16() })', () => {
    const layout = object({
      payload: bytes({ length: 'dynamic', prefix: u16({ endian: 'le' }) }),
    });

    const encoded = layout.encode({
      payload: new Uint8Array([0x10, 0x20, 0x30]),
    });

    expect(encoded).toEqual(new Uint8Array([0x03, 0x00, 0x10, 0x20, 0x30]));

    const decoded = layout.decode(encoded);
    expect(decoded.payload).toEqual(new Uint8Array([0x10, 0x20, 0x30]));
  });

  it('supports array(item, { length: fieldName })', () => {
    const layout = object({
      count: u8(),
      values: array(u16({ endian: 'be' }), { length: 'count' }),
    });

    const encoded = layout.encode({
      count: 2,
      values: [0x1234, 0xabcd],
    });

    expect(encoded).toEqual(new Uint8Array([0x02, 0x12, 0x34, 0xab, 0xcd]));

    const decoded = layout.decode(encoded);
    expect(decoded.count).toBe(2);
    expect(decoded.values).toEqual([0x1234, 0xabcd]);
  });

  it('supports array(item, { length: number }) and fixed size', () => {
    const layout = object({
      values: array(u8(), { length: 3 }),
    });

    expect(layout.size).toBe(3);
    expect(layout.computeSize({ values: [1, 2, 3] })).toBe(3);

    const encoded = layout.encode({ values: [1, 2, 3] });
    expect(encoded).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('throws explicit errors on invalid length references', () => {
    const layout = object({
      len: u8(),
      payload: bytes('missingLen'),
    });

    expect(() => layout.encode({ len: 2, payload: new Uint8Array([1, 2]) })).toThrow(SchemaEncodeError);
    expect(() => layout.decode(new Uint8Array([0x02, 0x01, 0x02]))).toThrow(SchemaParseError);
  });
});
