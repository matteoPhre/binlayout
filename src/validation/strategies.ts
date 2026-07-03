/**
 * Validation strategies: injectable contracts only.
 *
 * The library does not provide built-in CRC/checksum implementations.
 * Users can integrate any external package and inject it as a strategy.
 */

export type ValidationValue = number | Uint8Array;

/**
 * Generic validation strategy.
 * Compute returns the calculated value; verify checks that a datum matches the expected value.
 */
export interface ValidationStrategy<TValue extends ValidationValue = ValidationValue> {
  readonly name: string;

  /**
   * Calculates the validation value for a buffer.
   */
  compute(data: Uint8Array): TValue;

  /**
   * Verifies that the datum matches the calculated value.
   */
  verify(data: Uint8Array, expected: TValue): boolean;
}

export interface ValidationStrategyConfig<TValue extends ValidationValue> {
  readonly name: string;
  readonly compute: (data: Uint8Array) => TValue;
  readonly equals?: (actual: TValue, expected: TValue) => boolean;
}

/**
 * Factory for custom validation strategies.
 * Useful to adapt external CRC/checksum packages into this library contract.
 */
export function createValidationStrategy<TValue extends ValidationValue>(
  config: ValidationStrategyConfig<TValue>,
): ValidationStrategy<TValue> {
  const equals = config.equals ?? defaultValidationEquals;

  return {
    name: config.name,
    compute(data: Uint8Array): TValue {
      return config.compute(data);
    },
    verify(data: Uint8Array, expected: TValue): boolean {
      const actual = config.compute(data);
      return equals(actual, expected);
    },
  };
}

function defaultValidationEquals<TValue extends ValidationValue>(actual: TValue, expected: TValue): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return actual === expected;
  }

  if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
    if (actual.length !== expected.length) {
      return false;
    }

    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        return false;
      }
    }

    return true;
  }

  return false;
}
