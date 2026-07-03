/**
 * Test unitari per il parser (passo 2).
 * Verifica: compileSchema, parse per campi a lunghezza fissa, errori.
 */

import { describe, it, expect } from 'vitest';
import { compileSchema } from '../../src/core/parser.js';
import { SchemaCompileError, SchemaParseError } from '../../src/errors.js';

describe('Parser — compileSchema + parse (fixed-length fields)', () => {
  it('compila uno schema semplice con campi fissi', () => {
    const schema = {
      name: 'SimpleMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'cmd', type: 'uint8' as const },
        { name: 'value', type: 'uint16' as const },
      ] as const,
    };

    const compiled = compileSchema(schema);
    expect(compiled.name).toBe('SimpleMsg');
    expect(compiled.byteLength).toBe(3); // 1 + 2
    expect(compiled.fields).toHaveLength(2);
  });

  it('calcola offset in sequenza quando non espliciti', () => {
    const schema = {
      name: 'SequentialOffsets',
      endianness: 'BE' as const,
      fields: [
        { name: 'a', type: 'uint8' as const }, // offset 0
        { name: 'b', type: 'uint16' as const }, // offset 1
        { name: 'c', type: 'uint32' as const }, // offset 3
      ] as const,
    };

    const compiled = compileSchema(schema);
    expect(compiled.fields[0]!.offset).toBe(0);
    expect(compiled.fields[1]!.offset).toBe(1);
    expect(compiled.fields[2]!.offset).toBe(3);
    expect(compiled.byteLength).toBe(7);
  });

  it('accetta offset espliciti', () => {
    const schema = {
      name: 'ExplicitOffsets',
      endianness: 'LE' as const,
      fields: [
        { name: 'a', type: 'uint8' as const, offset: 0 },
        { name: 'b', type: 'uint16' as const, offset: 2 },
      ] as const,
    };

    const compiled = compileSchema(schema);
    expect(compiled.fields[0]!.offset).toBe(0);
    expect(compiled.fields[1]!.offset).toBe(2);
  });

  it('riconosce sovrapposizione di campi (fail fast)', () => {
    const schema = {
      name: 'Overlapping',
      endianness: 'LE' as const,
      fields: [
        { name: 'a', type: 'uint32' as const, offset: 0 },
        { name: 'b', type: 'uint16' as const, offset: 2 }, // sovrappone con 'a'
      ] as const,
    };

    expect(() => compileSchema(schema)).toThrow(SchemaCompileError);
  });

  it('parse uint8 big endian', () => {
    const schema = {
      name: 'U8',
      endianness: 'BE' as const,
      fields: [{ name: 'value', type: 'uint8' as const }] as const,
    };
    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x42]);
    const result = compiled.parse(buffer);
    expect(result.value).toBe(0x42);
  });

  it('parse uint16 little endian', () => {
    const schema = {
      name: 'U16LE',
      endianness: 'LE' as const,
      fields: [{ name: 'value', type: 'uint16' as const }] as const,
    };
    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x34, 0x12]); // 0x1234 in LE
    const result = compiled.parse(buffer);
    expect(result.value).toBe(0x1234);
  });

  it('parse uint16 big endian', () => {
    const schema = {
      name: 'U16BE',
      endianness: 'BE' as const,
      fields: [{ name: 'value', type: 'uint16' as const }] as const,
    };
    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x12, 0x34]); // 0x1234 in BE
    const result = compiled.parse(buffer);
    expect(result.value).toBe(0x1234);
  });

  it('parse uint32 little endian', () => {
    const schema = {
      name: 'U32LE',
      endianness: 'LE' as const,
      fields: [{ name: 'value', type: 'uint32' as const }] as const,
    };
    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x78, 0x56, 0x34, 0x12]); // 0x12345678 in LE
    const result = compiled.parse(buffer);
    expect(result.value).toBe(0x12345678);
  });

  it('parse uint32 big endian', () => {
    const schema = {
      name: 'U32BE',
      endianness: 'BE' as const,
      fields: [{ name: 'value', type: 'uint32' as const }] as const,
    };
    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]); // 0x12345678 in BE
    const result = compiled.parse(buffer);
    expect(result.value).toBe(0x12345678);
  });

  it('parse int8 positivo e negativo', () => {
    const schema = {
      name: 'I8',
      endianness: 'BE' as const,
      fields: [{ name: 'value', type: 'int8' as const }] as const,
    };
    const compiled = compileSchema(schema);

    let buffer = new Uint8Array([0x42]);
    expect(compiled.parse(buffer).value).toBe(0x42);

    buffer = new Uint8Array([0xff]);
    expect(compiled.parse(buffer).value).toBe(-1);
  });

  it('parse int16 little endian', () => {
    const schema = {
      name: 'I16LE',
      endianness: 'LE' as const,
      fields: [{ name: 'value', type: 'int16' as const }] as const,
    };
    const compiled = compileSchema(schema);

    let buffer = new Uint8Array([0x34, 0x12]); // 0x1234
    expect(compiled.parse(buffer).value).toBe(0x1234);

    buffer = new Uint8Array([0xff, 0xff]); // -1
    expect(compiled.parse(buffer).value).toBe(-1);
  });

  it('parse int32 big endian', () => {
    const schema = {
      name: 'I32BE',
      endianness: 'BE' as const,
      fields: [{ name: 'value', type: 'int32' as const }] as const,
    };
    const compiled = compileSchema(schema);

    let buffer = new Uint8Array([0x00, 0x00, 0x00, 0x01]);
    expect(compiled.parse(buffer).value).toBe(1);

    buffer = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    expect(compiled.parse(buffer).value).toBe(-1);
  });

  it('parse float32 little endian', () => {
    const schema = {
      name: 'F32LE',
      endianness: 'LE' as const,
      fields: [{ name: 'value', type: 'float32' as const }] as const,
    };
    const compiled = compileSchema(schema);

    // 1.0 in float32 LE: 0x3f800000 → bytes: 00 00 80 3f
    const buffer = new Uint8Array([0x00, 0x00, 0x80, 0x3f]);
    const result = compiled.parse(buffer);
    expect(result.value).toBeCloseTo(1.0, 5);
  });

  it('parse float64 big endian', () => {
    const schema = {
      name: 'F64BE',
      endianness: 'BE' as const,
      fields: [{ name: 'value', type: 'float64' as const }] as const,
    };
    const compiled = compileSchema(schema);

    // 1.0 in float64 BE: 0x3ff0000000000000 → bytes: 3f f0 00 00 00 00 00 00
    const buffer = new Uint8Array([0x3f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = compiled.parse(buffer);
    expect(result.value).toBeCloseTo(1.0, 10);
  });

  it('parse bytes (raw slice)', () => {
    const schema = {
      name: 'BytesMsg',
      endianness: 'LE' as const,
      fields: [{ name: 'payload', type: 'bytes' as const, length: 4 }] as const,
    };
    const compiled = compileSchema(schema);

    const buffer = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
    const result = compiled.parse(buffer);
    expect(result.payload).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
  });

  it('parse ascii stringa', () => {
    const schema = {
      name: 'ASCIIMsg',
      endianness: 'LE' as const,
      fields: [{ name: 'text', type: 'ascii' as const, length: 5 }] as const,
    };
    const compiled = compileSchema(schema);

    const buffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const result = compiled.parse(buffer);
    expect(result.text).toBe('Hello');
  });

  it('parse multiple campi misti', () => {
    const schema = {
      name: 'MixedMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'cmd', type: 'uint8' as const },
        { name: 'value', type: 'uint16' as const },
        { name: 'flag', type: 'int8' as const },
      ] as const,
    };
    const compiled = compileSchema(schema);

    const buffer = new Uint8Array([0x42, 0x34, 0x12, 0xff]); // cmd=0x42, value=0x1234, flag=-1
    const result = compiled.parse(buffer);
    expect(result.cmd).toBe(0x42);
    expect(result.value).toBe(0x1234);
    expect(result.flag).toBe(-1);
  });

  it('parse con offset nel buffer', () => {
    const schema = {
      name: 'OffsetMsg',
      endianness: 'LE' as const,
      fields: [{ name: 'value', type: 'uint16' as const }] as const,
    };
    const compiled = compileSchema(schema);

    const buffer = new Uint8Array([0x00, 0x00, 0x34, 0x12]); // dati utili a offset 2
    const result = compiled.parse(buffer, 2);
    expect(result.value).toBe(0x1234);
  });

  it('buffer insufficiente lancia SchemaParseError', () => {
    const schema = {
      name: 'ShortMsg',
      endianness: 'LE' as const,
      fields: [{ name: 'value', type: 'uint16' as const }] as const,
    };
    const compiled = compileSchema(schema);

    const buffer = new Uint8Array([0x42]); // solo 1 byte, ne serve 2
    expect(() => compiled.parse(buffer)).toThrow(SchemaParseError);
  });

  it('endianness esplicita per singolo campo sovrascrive default', () => {
    const schema = {
      name: 'MixedEndian',
      endianness: 'LE' as const,
      fields: [
        { name: 'a', type: 'uint16' as const }, // usa LE (default)
        { name: 'b', type: 'uint16' as const, endianness: 'BE' as const }, // forza BE
      ] as const,
    };
    const compiled = compileSchema(schema);

    const buffer = new Uint8Array([0x34, 0x12, 0x12, 0x34]);
    const result = compiled.parse(buffer);
    expect(result.a).toBe(0x1234); // LE
    expect(result.b).toBe(0x1234); // BE
  });

  it('parseInto riusa l\'oggetto target (zero-alloc)', () => {
    const schema = {
      name: 'ReuseMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'a', type: 'uint8' as const },
        { name: 'b', type: 'uint8' as const },
      ] as const,
    };
    const compiled = compileSchema(schema);

    const buffer = new Uint8Array([0x01, 0x02]);
    const target = { a: 0, b: 0, extra: 'should remain' };
    const result = compiled.parseInto(buffer, target);

    // Ritorna lo stesso oggetto
    expect(result).toBe(target);
    expect(result.a).toBe(0x01);
    expect(result.b).toBe(0x02);
    expect((result as any).extra).toBe('should remain');
  });

  it('schema vuoto (nessun campo)', () => {
    const schema = {
      name: 'EmptyMsg',
      endianness: 'LE' as const,
      fields: [] as const,
    };
    const compiled = compileSchema(schema);
    expect(compiled.byteLength).toBe(0);
    expect(compiled.fields).toHaveLength(0);

    const buffer = new Uint8Array([]);
    const result = compiled.parse(buffer);
    expect(result).toEqual({});
  });
});
