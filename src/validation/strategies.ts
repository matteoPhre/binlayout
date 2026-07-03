/**
 * Validation strategies: interface and predefined implementations.
 *
 * All functions are pure and stateless.
 */

/**
 * Generic validation strategy.
 * Compute returns the calculated value; verify checks that a datum matches the expected value.
 */
export interface ValidationStrategy {
  readonly name: string;

  /**
   * Calculates the validation value for a buffer.
   * @param data Binary buffer to calculate the checksum/CRC on.
   * @returns Validation value (number or Uint8Array).
   */
  compute(data: Uint8Array): number | Uint8Array;

  /**
   * Verifies that the datum matches the calculated value.
   * @param data Buffer to validate.
   * @param expected Expected value (number or Uint8Array).
   * @returns true if valid, false otherwise.
   */
  verify(data: Uint8Array, expected: number | Uint8Array): boolean;
}

/**
 * CRC16-CCITT (0x1021, init 0xFFFF, final XOR 0xFFFF).
 * Commonly used in Modbus RTU, HDLC and other protocols.
 */
export const crc16Ccitt: ValidationStrategy = {
  name: 'crc16-ccitt',

  compute(data: Uint8Array): number {
    let crc = 0xffff;

    for (let i = 0; i < data.length; i++) {
      const byte = data[i]!;
      crc ^= byte;

      for (let j = 0; j < 8; j++) {
        const carry = crc & 1;
        crc >>= 1;
        if (carry) {
          crc ^= 0xa001; // reversed 0x1021
        }
      }
    }

    return crc ^ 0xffff;
  },

  verify(data: Uint8Array, expected: number | Uint8Array): boolean {
    if (typeof expected !== 'number') return false;
    return crc16Ccitt.compute(data) === expected;
  },
};

/**
 * CRC32 (IEEE 802.3, polynomial 0x04C11DB7).
 * Commonly used in Ethernet, ZIP, and many other protocols.
 */
export const crc32: ValidationStrategy = {
  name: 'crc32',

  compute(data: Uint8Array): number {
    let crc = 0xffffffff;
    const CRC32_TABLE = makeCrc32Table();

    for (let i = 0; i < data.length; i++) {
      const byte = data[i]!;
      const tbl_idx = (crc ^ byte) & 0xff;
      crc = ((crc >>> 8) ^ CRC32_TABLE[tbl_idx]!) >>> 0;
    }

    return (crc ^ 0xffffffff) >>> 0;
  },

  verify(data: Uint8Array, expected: number | Uint8Array): boolean {
    if (typeof expected !== 'number') return false;
    return crc32.compute(data) === expected;
  },
};

/**
 * Checksum8 XOR: accumulates XOR of all bytes.
 * Simple and lightweight.
 */
export const checksum8Xor: ValidationStrategy = {
  name: 'checksum8-xor',

  compute(data: Uint8Array): number {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum ^= data[i]!;
    }
    return checksum & 0xff;
  },

  verify(data: Uint8Array, expected: number | Uint8Array): boolean {
    if (typeof expected !== 'number') return false;
    return checksum8Xor.compute(data) === expected;
  },
};

/**
 * Checksum8 Sum: accumulates sum of all bytes, modulo 256.
 * Commonly used in simple protocols.
 */
export const checksum8Sum: ValidationStrategy = {
  name: 'checksum8-sum',

  compute(data: Uint8Array): number {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum = (checksum + data[i]!) & 0xff;
    }
    return checksum;
  },

  verify(data: Uint8Array, expected: number | Uint8Array): boolean {
    if (typeof expected !== 'number') return false;
    return checksum8Sum.compute(data) === expected;
  },
};

/**
 * Generates the lookup table for CRC32.
 * Calculated once, not repeated for each compute.
 */
function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  const POLYNOMIAL = 0xedb88320; // reversed 0x04C11DB7

  for (let i = 0; i < 256; i++) {
    let crc = i;

    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ POLYNOMIAL;
      } else {
        crc >>>= 1;
      }
    }

    table[i] = crc >>> 0;
  }

  return table;
}
