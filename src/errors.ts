/**
 * Typed error classes for binary parsing.
 * Each error has structured fields to enable programmatic recovery.
 */

/**
 * Schema parse error.
 * Thrown when buffer is insufficient or malformed for the schema.
 */
export class SchemaParseError extends Error {
  readonly name = 'SchemaParseError';

  constructor(
    message: string,
    readonly offset: number,
    readonly fieldName: string | null,
    readonly reason: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, SchemaParseError.prototype);
  }
}

/**
 * Schema compile error.
 * Thrown when schema is malformed (e.g., overlapping offsets).
 */
export class SchemaCompileError extends Error {
  readonly name = 'SchemaCompileError';

  constructor(
    message: string,
    readonly issue: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, SchemaCompileError.prototype);
  }
}

/**
 * Validation error.
 * Thrown when data fails validation (e.g., CRC mismatch).
 */
export class ValidationError extends Error {
  readonly name = 'ValidationError';

  constructor(
    message: string,
    readonly strategy: string,
    readonly expected: number | Uint8Array,
    readonly actual: number | Uint8Array,
  ) {
    super(message);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
