/**
 * Base definitions for binary schemas.
 */

/**
 * Byte order: Big Endian (BE) or Little Endian (LE).
 */
export type Endianness = 'BE' | 'LE';

/**
 * Primitive types supported in binary format.
 */
export type PrimitiveType =
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'float32'
  | 'float64'
  | 'bytes'  // raw slice, fixed or variable length
  | 'ascii'; // string, fixed or variable length

/**
 * Definition of a single binary field.
 *
 * @template Name - Field name (used as key in output type)
 */
export interface FieldDef<Name extends string = string> {
  /** Unique field name in the schema. */
  readonly name: Name;

  /** Primitive type of the field. */
  readonly type: PrimitiveType;

  /**
   * Endianness for this field.
   * If omitted, uses schema default.
   */
  readonly endianness?: Endianness;

  /**
   * Fixed length in bytes (for 'bytes' and 'ascii').
   * If omitted and type is 'bytes'/'ascii', the field is dynamic
   * and requires 'lengthFrom'.
   */
  readonly length?: number;

  /**
   * Name of a previous field that contains the length of this field.
   * Used for variable-length fields.
   * The referenced field must be numeric type (uint8/uint16/uint32/int8/int16/int32).
   */
  readonly lengthFrom?: string;

  /**
   * Explicit byte offset from buffer start.
   * If omitted, automatically calculated sequentially by compiler.
   * If specified, compiler verifies no overlaps.
   */
  readonly offset?: number;
}

/**
 * Complete definition of a binary schema.
 *
 * @template Fields - Readonly array of FieldDef composing the schema
 */
export interface SchemaDef<Fields extends readonly FieldDef[] = readonly FieldDef[]> {
  /** Symbolic schema name (e.g., "ModbusRTUMessage"). */
  readonly name: string;

  /** Default endianness for all fields that don't specify it explicitly. */
  readonly endianness: Endianness;

  /** Readonly array of fields. Must be const-asserted to preserve literal names. */
  readonly fields: Fields;
}

/**
 * Map of byte lengths for each primitive type (when fixed).
 * For 'bytes' and 'ascii', length depends on specific field.
 */
export const PRIMITIVE_BYTE_SIZES: Record<PrimitiveType, number | null> = {
  'uint8': 1,
  'uint16': 2,
  'uint32': 4,
  'int8': 1,
  'int16': 2,
  'int32': 4,
  'float32': 4,
  'float64': 8,
  'bytes': null,
  'ascii': null,
};
