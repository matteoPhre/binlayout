/**
 * @matteophre/binlayout — Entry point pubblico.
 *
 * Esporta solo le parti essenziali del core.
 * Transport-specific framers e adapters vanno importati da entry-point separati.
 */

// Core API
export { compileSchema, type CompiledSchema } from './core/parser.js';
export { type Endianness, type FieldDef, type PrimitiveType, type SchemaDef } from './core/schema.js';
export { type InferSchemaType } from './core/types.js';

// Validation
export {
  checksum8Sum,
  checksum8Xor,
  crc16Ccitt,
  crc32,
  type ValidationStrategy,
} from './validation/strategies.js';

// Errors
export { SchemaCompileError, SchemaParseError, ValidationError } from './errors.js';
