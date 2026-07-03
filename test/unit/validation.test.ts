/**
 * Test unitari per validation strategies (passo 6).
 * Verifica CRC16, CRC32, Checksum8 contro vettori di test noti.
 */

import { describe, it, expect } from 'vitest';
import { crc16Ccitt, crc32, checksum8Xor, checksum8Sum } from '../../src/validation/strategies.js';

describe('Validation Strategies', () => {
  describe('CRC16-CCITT', () => {
    it('computa CRC16 per buffer vuoto', () => {
      const data = new Uint8Array([]);
      const result = crc16Ccitt.compute(data);
      // Verifica che sia un numero valido e deterministico
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xffff);
    });

    it('CRC16 è deterministico', () => {
      const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]); // "123456789"
      const result1 = crc16Ccitt.compute(data);
      const result2 = crc16Ccitt.compute(data);
      expect(result1).toBe(result2);
    });

    it('CRC16 differisce per dati diversi', () => {
      const data1 = new Uint8Array([0x31, 0x32, 0x33]);
      const data2 = new Uint8Array([0x31, 0x32, 0x34]);
      const crc1 = crc16Ccitt.compute(data1);
      const crc2 = crc16Ccitt.compute(data2);
      expect(crc1).not.toBe(crc2);
    });

    it('verifica CRC16 corretto', () => {
      const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
      const crc = crc16Ccitt.compute(data);
      expect(crc16Ccitt.verify(data, crc)).toBe(true);
    });

    it('verifica CRC16 errato ritorna false', () => {
      const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
      expect(crc16Ccitt.verify(data, 0x0000)).toBe(false);
    });

    it('verifica CRC16 con tipo errato (Uint8Array)', () => {
      const data = new Uint8Array([0x31, 0x32, 0x33]);
      const invalidExpected = new Uint8Array([0x00, 0x00]);
      expect(crc16Ccitt.verify(data, invalidExpected as unknown as number)).toBe(false);
    });

    it('computa CRC16 per singolo byte', () => {
      const data = new Uint8Array([0x00]);
      const result = crc16Ccitt.compute(data);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xffff);
    });
  });

  describe('CRC32', () => {
    it('computa CRC32 per buffer vuoto', () => {
      const data = new Uint8Array([]);
      const result = crc32.compute(data);
      // CRC32 di buffer vuoto è 0x00000000 (after final XOR)
      expect(result).toBe(0);
    });

    it('computa CRC32 per stringa "123456789"', () => {
      const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]); // "123456789"
      const result = crc32.compute(data);
      // Vettore di test standard IEEE 802.3: 0xCBF43926
      expect(result).toBe(0xcbf43926);
    });

    it('verifica CRC32 corretto', () => {
      const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
      const crc = crc32.compute(data);
      expect(crc32.verify(data, crc)).toBe(true);
    });

    it('verifica CRC32 errato ritorna false', () => {
      const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
      expect(crc32.verify(data, 0x00000000)).toBe(false);
    });

    it('verifica CRC32 con tipo errato (Uint8Array)', () => {
      const data = new Uint8Array([0x31, 0x32, 0x33]);
      const invalidExpected = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      expect(crc32.verify(data, invalidExpected as unknown as number)).toBe(false);
    });

    it('computa CRC32 per buffer più grande', () => {
      const data = new Uint8Array(1000);
      for (let i = 0; i < data.length; i++) {
        data[i] = (i * 7) & 0xff;
      }
      const result = crc32.compute(data);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xffffffff);
    });
  });

  describe('Checksum8 XOR', () => {
    it('computa XOR su buffer vuoto', () => {
      const data = new Uint8Array([]);
      expect(checksum8Xor.compute(data)).toBe(0);
    });

    it('computa XOR su buffer semplice', () => {
      const data = new Uint8Array([0xFF, 0xFF]);
      expect(checksum8Xor.compute(data)).toBe(0x00); // 0xFF ^ 0xFF = 0x00
    });

    it('computa XOR su buffer arbitrario', () => {
      const data = new Uint8Array([0x12, 0x34, 0x56]);
      const result = checksum8Xor.compute(data);
      expect(result).toBe(0x12 ^ 0x34 ^ 0x56);
    });

    it('verifica XOR corretto', () => {
      const data = new Uint8Array([0xAA, 0xBB, 0xCC]);
      const checksum = checksum8Xor.compute(data);
      expect(checksum8Xor.verify(data, checksum)).toBe(true);
    });

    it('verifica XOR errato ritorna false', () => {
      const data = new Uint8Array([0xAA, 0xBB, 0xCC]);
      expect(checksum8Xor.verify(data, 0x00)).toBe(false);
    });
  });

  describe('Checksum8 Sum', () => {
    it('computa sum su buffer vuoto', () => {
      const data = new Uint8Array([]);
      expect(checksum8Sum.compute(data)).toBe(0);
    });

    it('computa sum su buffer semplice', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      expect(checksum8Sum.compute(data)).toBe(0x06); // 1 + 2 + 3 = 6
    });

    it('computa sum con overflow (modulo 256)', () => {
      const data = new Uint8Array([0xFF, 0xFF]);
      // 0xFF + 0xFF = 0x1FE, modulo 256 = 0xFE
      expect(checksum8Sum.compute(data)).toBe(0xfe);
    });

    it('verifica sum corretto', () => {
      const data = new Uint8Array([0x10, 0x20, 0x30]);
      const checksum = checksum8Sum.compute(data);
      expect(checksum8Sum.verify(data, checksum)).toBe(true);
    });

    it('verifica sum errato ritorna false', () => {
      const data = new Uint8Array([0x10, 0x20, 0x30]);
      expect(checksum8Sum.verify(data, 0x00)).toBe(false);
    });
  });

  describe('Integration — estratto da dati reali (Modbus-like)', () => {
    it('CRC16 è deterministico per messaggio Modbus-like', () => {
      // Messaggio Modbus RTU tipico: [01, 03, 00, 00, 00, 0A, ...]
      const message = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]);
      const crc1 = crc16Ccitt.compute(message);
      const crc2 = crc16Ccitt.compute(message);
      expect(crc1).toBe(crc2);
      expect(typeof crc1).toBe('number');
    });

    it('CRC32 per payload binario', () => {
      const payload = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
      const crc = crc32.compute(payload);
      // Verifica che sia deterministico
      const crcAgain = crc32.compute(payload);
      expect(crc).toBe(crcAgain);
    });
  });
});
