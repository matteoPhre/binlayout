/**
 * Classi di errore tipizzate per il parsing binario.
 * Ogni errore ha campi strutturati per permettere il recovery programmatico.
 */

/**
 * Errore di parsing schema.
 * Lanciato quando il buffer è insufficiente o malformato per lo schema.
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
 * Errore di compilazione schema.
 * Lanciato quando lo schema è malformato (es. offset sovrapposti).
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
 * Errore di validazione.
 * Lanciato quando un dato non passa la validazione (es. CRC mismatch).
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
