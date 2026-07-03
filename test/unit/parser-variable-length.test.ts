/**
 * Test unitari per il parser — campi a lunghezza variabile (passo 4).
 * Verifica: compileSchema con lengthFrom, parse di campi variabili, errori.
 */

import { describe, it, expect } from 'vitest';
import { compileSchema } from '../../src/core/parser.js';
import { SchemaCompileError, SchemaParseError } from '../../src/errors.js';

describe('Parser — variable-length fields (lengthFrom)', () => {
  it('schema con campo variabile bytes ha byteLength null', () => {
    const schema = {
      name: 'VarBytesMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len', type: 'uint8' as const },
        { name: 'data', type: 'bytes' as const, lengthFrom: 'len' as const },
      ] as const,
    };

    const compiled = compileSchema(schema);
    expect(compiled.byteLength).toBeNull();
    expect(compiled.fields).toHaveLength(2);
  });

  it('parse campo variabile bytes', () => {
    const schema = {
      name: 'VarBytesMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len', type: 'uint8' as const },
        { name: 'data', type: 'bytes' as const, lengthFrom: 'len' as const },
      ] as const,
    };

    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x03, 0x41, 0x42, 0x43, 0x44]); // len=3, data=[A,B,C]
    const result = compiled.parse(buffer);

    expect(result.len).toBe(3);
    expect(result.data).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
  });

  it('parse campo variabile ascii', () => {
    const schema = {
      name: 'VarASCIIMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len', type: 'uint8' as const },
        { name: 'text', type: 'ascii' as const, lengthFrom: 'len' as const },
      ] as const,
    };

    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]); // len=5, "Hello"
    const result = compiled.parse(buffer);

    expect(result.len).toBe(5);
    expect(result.text).toBe('Hello');
  });

  it('parse campo variabile con lunghezza zero', () => {
    const schema = {
      name: 'EmptyVarMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len', type: 'uint8' as const },
        { name: 'data', type: 'bytes' as const, lengthFrom: 'len' as const },
      ] as const,
    };

    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x00]); // len=0, no data
    const result = compiled.parse(buffer);

    expect(result.len).toBe(0);
    expect(result.data).toEqual(new Uint8Array([]));
  });

  it('parseInto campo variabile', () => {
    const schema = {
      name: 'VarBytesMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len', type: 'uint8' as const },
        { name: 'data', type: 'bytes' as const, lengthFrom: 'len' as const },
      ] as const,
    };

    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x02, 0xFF, 0xEE]);
    const target: any = {};
    const result = compiled.parseInto(buffer, target);

    expect(result).toBe(target);
    expect(result.len).toBe(2);
    expect(result.data).toEqual(new Uint8Array([0xFF, 0xEE]));
  });

  it('errore se lengthFrom referenzia campo inesistente', () => {
    const schema = {
      name: 'InvalidMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'data', type: 'bytes' as const, lengthFrom: 'nonexistent' as const },
      ] as const,
    };

    expect(() => compileSchema(schema)).toThrow(SchemaCompileError);
  });

  it('errore se lengthFrom referenzia campo non numerico', () => {
    const schema = {
      name: 'InvalidMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len_text', type: 'ascii' as const, length: 2 },
        { name: 'data', type: 'bytes' as const, lengthFrom: 'len_text' as const },
      ] as const,
    };

    expect(() => compileSchema(schema)).toThrow(SchemaCompileError);
  });

  it('buffer insufficiente per campo variabile lancia SchemaParseError', () => {
    const schema = {
      name: 'VarBytesMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len', type: 'uint8' as const },
        { name: 'data', type: 'bytes' as const, lengthFrom: 'len' as const },
      ] as const,
    };

    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x10]); // len=16, but only 1 byte total
    expect(() => compiled.parse(buffer)).toThrow(SchemaParseError);
  });

  it('campo variabile con lunghezza da uint16', () => {
    const schema = {
      name: 'VarU16Msg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len', type: 'uint16' as const },
        { name: 'data', type: 'bytes' as const, lengthFrom: 'len' as const },
      ] as const,
    };

    const compiled = compileSchema(schema);
    const buffer = new Uint8Array([0x04, 0x00, 0xAA, 0xBB, 0xCC, 0xDD]); // len=4 (LE), data=[AA,BB,CC,DD]
    const result = compiled.parse(buffer);

    expect(result.len).toBe(4);
    expect(result.data).toEqual(new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]));
  });

  it('multipli campi variabili sequenziali', () => {
    const schema = {
      name: 'MultiVarMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'len1', type: 'uint8' as const },
        { name: 'data1', type: 'bytes' as const, lengthFrom: 'len1' as const },
        { name: 'len2', type: 'uint8' as const, offset: 3 }, // offset esplicito dopo variabile
        { name: 'data2', type: 'bytes' as const, lengthFrom: 'len2' as const, offset: 4 },
      ] as const,
    };

    const compiled = compileSchema(schema);
    // len1=2 @ 0, data1=[11,22] @ 1-2, len2=3 @ 3, data2=[AA,BB,CC] @ 4-6
    const buffer = new Uint8Array([0x02, 0x11, 0x22, 0x03, 0xAA, 0xBB, 0xCC]);
    const result = compiled.parse(buffer);

    expect(result.len1).toBe(2);
    expect(result.data1).toEqual(new Uint8Array([0x11, 0x22]));
    expect(result.len2).toBe(3);
    expect(result.data2).toEqual(new Uint8Array([0xAA, 0xBB, 0xCC]));
  });

  it('campo fisso e variabile mischiati (offset esplicito dopo variabile)', () => {
    const schema = {
      name: 'MixedMsg',
      endianness: 'LE' as const,
      fields: [
        { name: 'header', type: 'uint16' as const },
        { name: 'len', type: 'uint8' as const },
        { name: 'payload', type: 'bytes' as const, lengthFrom: 'len' as const },
        { name: 'footer', type: 'uint8' as const, offset: 5 }, // offset esplicito: 3 (header) + 2 (len) = 5 @ base, + 0 payload = 5
      ] as const,
    };

    const compiled = compileSchema(schema);
    // header=0x1234 (LE) @ 0-1, len=2 @ 2, payload=[FF,EE] @ 3-4, footer=0x99 @ 5
    const buffer = new Uint8Array([0x34, 0x12, 0x02, 0xFF, 0xEE, 0x99]);
    const result = compiled.parse(buffer);

    expect(result.header).toBe(0x1234);
    expect(result.len).toBe(2);
    expect(result.payload).toEqual(new Uint8Array([0xFF, 0xEE]));
    expect(result.footer).toBe(0x99);
  });
});
