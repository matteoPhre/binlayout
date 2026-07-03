/**
 * Unit tests for injectable validation strategies.
 */

import { describe, expect, it } from 'vitest';
import {
  createValidationStrategy,
  type ValidationStrategy,
} from '../../src/validation/strategies.js';

describe('Validation strategies (injectable)', () => {
  it('verifies numeric strategies with default equality', () => {
    const sum8 = createValidationStrategy<number>({
      name: 'sum8',
      compute(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum = (sum + data[i]!) & 0xff;
        }
        return sum;
      },
    });

    const payload = new Uint8Array([0x01, 0x02, 0x03]);
    expect(sum8.compute(payload)).toBe(0x06);
    expect(sum8.verify(payload, 0x06)).toBe(true);
    expect(sum8.verify(payload, 0x07)).toBe(false);
  });

  it('verifies binary strategies with default Uint8Array equality', () => {
    const echo2 = createValidationStrategy<Uint8Array>({
      name: 'echo2',
      compute(data) {
        return data.subarray(0, 2);
      },
    });

    const payload = new Uint8Array([0xaa, 0xbb, 0xcc]);
    expect(echo2.verify(payload, new Uint8Array([0xaa, 0xbb]))).toBe(true);
    expect(echo2.verify(payload, new Uint8Array([0xaa, 0xbc]))).toBe(false);
  });

  it('supports custom equality function', () => {
    const tolerant = createValidationStrategy<number>({
      name: 'numeric-tolerant',
      compute() {
        return 100;
      },
      equals(actual, expected) {
        return Math.abs(actual - expected) <= 1;
      },
    });

    const payload = new Uint8Array([0x00]);
    expect(tolerant.verify(payload, 101)).toBe(true);
    expect(tolerant.verify(payload, 98)).toBe(false);
  });

  it('accepts externally implemented strategies', () => {
    const externalStyleStrategy: ValidationStrategy<number> = {
      name: 'external-crc-adapter',
      compute(data) {
        // Placeholder for an external package call.
        return data.length;
      },
      verify(data, expected) {
        return this.compute(data) === expected;
      },
    };

    const payload = new Uint8Array([0x10, 0x20, 0x30]);
    expect(externalStyleStrategy.verify(payload, 3)).toBe(true);
    expect(externalStyleStrategy.verify(payload, 4)).toBe(false);
  });
});
