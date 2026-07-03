/**
 * Binary parser: schema compilation and parsing.
 *
 * Strategy for zero-alloc:
 * - compileSchema() is called once, can allocate intermediate data structures.
 * - parse() / parseInto() do not allocate beyond the result object (or reuse the provided one).
 * - Each field has a precompiled reader function specialized for type/endianness.
 * - Variable fields are handled by calculating the length from the value of a previous field.
 */

import {
  type Endianness,
  type PrimitiveType,
  PRIMITIVE_BYTE_SIZES,
  type SchemaDef,
} from './schema.js';
import { SchemaCompileError, SchemaParseError } from '../errors.js';

/**
 * Specialized function to read a field from a buffer.
 * For fixed fields, offset is known.
 * For variable fields, the length depends on a previous field.
 *
 * Returns the read value.
 */
type FieldReader = (buffer: Uint8Array, offset: number) => number | Uint8Array | string;

/**
 * Precompiled definition of how to read a field.
 * Discriminated union for fixed vs variable.
 */
type CompiledFieldDef =
  | {
      readonly type: 'fixed';
      readonly name: string;
      readonly offset: number; // known absolute offset
      readonly byteLength: number; // fixed length
      readonly reader: FieldReader;
    }
  | {
      readonly type: 'variable';
      readonly name: string;
      readonly offset: number; // known absolute offset up to this point
      readonly lengthFromFieldName: string; // name of the previous field that contains the length
      readonly reader: (buffer: Uint8Array, offset: number, length: number) => Uint8Array | string; // reader that accepts length
    };

/**
 * Compiled schema, ready for repeated zero-alloc parsing.
 */
export interface CompiledSchema<_S extends SchemaDef = SchemaDef> {
  readonly name: string;
  readonly byteLength: number | null; // null se contiene campi variabili
  readonly fields: readonly CompiledFieldDef[];

  /**
   * Parses a buffer and returns an object with typed fields.
   */
  parse(buffer: Uint8Array, offset?: number): Record<string, unknown>; // typed by InferSchemaType<S>

  /**
   * Parses a buffer by reusing a target object.
   * Zero-alloc: does not create a new object, but populates the provided target.
   */
  parseInto(buffer: Uint8Array, target: Record<string, unknown>, offset?: number): Record<string, unknown>;
}

/**
 * Compiles a schema once.
 * Verifies the schema validity, calculates offsets, generates specialized reader functions.
 *
 * Throws SchemaCompileError if the schema is malformed.
 */
export function compileSchema<const S extends SchemaDef>(schema: S): CompiledSchema<S> {
  const compiledFields: CompiledFieldDef[] = [];
  let runningOffset = 0;
  let hasVariableFields = false;

  // First pass: validate and collect info
  const fieldNames = new Set<string>();
  const fieldTypes: Record<string, PrimitiveType> = {};

  for (const field of schema.fields) {
    if (fieldNames.has(field.name)) {
      throw new SchemaCompileError(
        `Field '${field.name}' is duplicated`,
        'DUPLICATE_FIELD',
      );
    }
    fieldNames.add(field.name);
    fieldTypes[field.name] = field.type;
  }

  // Second pass: compile fields
  for (const field of schema.fields) {
    // Determines offset: explicit or calculated
    const fieldOffset = field.offset !== undefined ? field.offset : runningOffset;

    // Calculates field length
    const baseByteSize = PRIMITIVE_BYTE_SIZES[field.type];
    const isVariable = baseByteSize === null && field.length === undefined && field.lengthFrom !== undefined;

    if (isVariable) {
      // Variable fields: bytes/ascii with lengthFrom
      if (field.lengthFrom === undefined) {
        throw new SchemaCompileError(
          `Field '${field.name}' is variable-length but has no 'lengthFrom'`,
          'VARIABLE_LENGTH_WITHOUT_SIZE',
        );
      }

      // Verifies that the referenced field exists and is previous
      const lengthFromIndex = compiledFields.findIndex((f) => f.name === field.lengthFrom);
      if (lengthFromIndex === -1) {
        throw new SchemaCompileError(
          `Field '${field.name}' references non-existent lengthFrom field '${field.lengthFrom}'`,
          'INVALID_LENGTH_FROM',
        );
      }

      // Verifies that the referenced field is numeric type
      const lengthFromType = fieldTypes[field.lengthFrom];
      if (!lengthFromType) {
        throw new SchemaCompileError(
          `Field '${field.name}' references lengthFrom field '${field.lengthFrom}' which does not exist`,
          'INVALID_LENGTH_FROM',
        );
      }
      const numericTypes = [
        'uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32',
      ];
      if (!numericTypes.includes(lengthFromType)) {
        throw new SchemaCompileError(
          `Field '${field.name}' references lengthFrom field '${field.lengthFrom}' which is not numeric (type: ${lengthFromType})`,
          'INVALID_LENGTH_FROM_TYPE',
        );
      }

      // Generates reader for variable field
      const endianness = field.endianness ?? schema.endianness;
      const reader = makeVariableLengthReader(field.type, endianness);

      compiledFields.push({
        type: 'variable',
        name: field.name,
        offset: fieldOffset,
        lengthFromFieldName: field.lengthFrom,
        reader,
      });

      hasVariableFields = true;
      // Do not update runningOffset for variable fields (we don't know the length at compile time)
    } else {
      // Fixed fields
      if (field.length !== undefined && field.length <= 0) {
        throw new SchemaCompileError(
          `Field '${field.name}' has invalid byte length`,
          'INVALID_BYTE_LENGTH',
        );
      }

      const byteLength = field.length ?? baseByteSize;
      if (byteLength === null || byteLength <= 0) {
        throw new SchemaCompileError(
          `Field '${field.name}' has invalid byte length`,
          'INVALID_BYTE_LENGTH',
        );
      }

      // Checks overlaps (only between fixed fields)
      for (const existing of compiledFields) {
        if (existing.type !== 'fixed') continue;
        const existingEnd = existing.offset + existing.byteLength;
        const fieldEnd = fieldOffset + byteLength;
        if (!(fieldEnd <= existing.offset || fieldOffset >= existingEnd)) {
          throw new SchemaCompileError(
            `Field '${field.name}' at offset ${fieldOffset} overlaps with '${existing.name}' at ${existing.offset}`,
            'OVERLAPPING_FIELDS',
          );
        }
      }

      // Generates specialized reader function
      const endianness = field.endianness ?? schema.endianness;
      const reader = makeFieldReader(field.type, byteLength, endianness);

      compiledFields.push({
        type: 'fixed',
        name: field.name,
        offset: fieldOffset,
        byteLength,
        reader,
      });

      // Updates running offset (for the next field, only if the previous is not variable)
      if (field.offset === undefined && !hasVariableFields) {
        runningOffset = fieldOffset + byteLength;
      }
    }
  }

  // Calculates total schema length
  let totalByteLength: number | null = null;
  if (!hasVariableFields) {
    totalByteLength =
      compiledFields.length > 0
        ? Math.max(
            ...(compiledFields as Array<Extract<CompiledFieldDef, { type: 'fixed' }>>).map(
              (f) => f.offset + f.byteLength,
            ),
          )
        : 0;
  }

  // Returns the compiled schema
  return {
    name: schema.name,
    byteLength: totalByteLength,
    fields: compiledFields,

    parse(buffer: Uint8Array, offset = 0): Record<string, unknown> {
      const result: Record<string, unknown> = {};

      for (const field of compiledFields) {
        if (field.type === 'fixed') {
          const value = field.reader(buffer, offset + field.offset);
          result[field.name] = value;
        } else {
          // Variable field: read the length from the previous field
          const lengthValue = result[field.lengthFromFieldName];
          if (typeof lengthValue !== 'number') {
            throw new SchemaParseError(
              `Field '${field.name}' depends on lengthFrom '${field.lengthFromFieldName}' which is not a number`,
              offset,
              field.name,
              'LENGTH_FROM_NOT_NUMBER',
            );
          }
          const value = field.reader(buffer, offset + field.offset, lengthValue);
          result[field.name] = value;
        }
      }

      return result;
    },

    parseInto(buffer: Uint8Array, target: Record<string, unknown>, offset = 0): Record<string, unknown> {
      for (const field of compiledFields) {
        if (field.type === 'fixed') {
          const value = field.reader(buffer, offset + field.offset);
          target[field.name] = value;
        } else {
          // Variable field: read the length from the previous field
          const lengthValue = target[field.lengthFromFieldName];
          if (typeof lengthValue !== 'number') {
            throw new SchemaParseError(
              `Field '${field.name}' depends on lengthFrom '${field.lengthFromFieldName}' which is not a number`,
              offset,
              field.name,
              'LENGTH_FROM_NOT_NUMBER',
            );
          }
          const value = field.reader(buffer, offset + field.offset, lengthValue);
          target[field.name] = value;
        }
      }

      return target;
    },
  };
}

/**
 * Creates a reader for variable-length fields.
 * The length is passed at parsing time.
 */
function makeVariableLengthReader(
  type: PrimitiveType,
  _endianness: Endianness,
): (buffer: Uint8Array, offset: number, length: number) => Uint8Array | string {
  if (type === 'bytes') {
    return (buffer: Uint8Array, offset: number, length: number): Uint8Array => {
      if (offset + length > buffer.length) {
        throw new SchemaParseError(
          `Insufficient buffer: expected ${length} bytes at offset ${offset}, got ${buffer.length - offset}`,
          offset,
          null,
          'BUFFER_UNDERRUN',
        );
      }
      return buffer.slice(offset, offset + length);
    };
  } else if (type === 'ascii') {
    return (buffer: Uint8Array, offset: number, length: number): string => {
      if (offset + length > buffer.length) {
        throw new SchemaParseError(
          `Insufficient buffer: expected ${length} bytes at offset ${offset}, got ${buffer.length - offset}`,
          offset,
          null,
          'BUFFER_UNDERRUN',
        );
      }
      return decodeASCII(buffer, offset, length);
    };
  } else {
    throw new Error(`Variable-length fields are only supported for 'bytes' and 'ascii', not '${type}'`);
  }
}

/**
 * Creates a specialized FieldReader for the provided type, length, and endianness.
 * For fixed-length fields.
 */
function makeFieldReader(type: PrimitiveType, byteLength: number, endianness: Endianness): FieldReader {
  return (buffer: Uint8Array, offset: number): number | Uint8Array | string => {
    // Checks bounds
    if (offset + byteLength > buffer.length) {
      throw new SchemaParseError(
        `Insufficient buffer: expected at least ${byteLength} bytes at offset ${offset}, got ${buffer.length - offset}`,
        offset,
        null,
        'BUFFER_UNDERRUN',
      );
    }

    // Reader for type
    switch (type) {
      case 'uint8':
        return buffer[offset]!;

      case 'uint16':
        return endianness === 'LE'
          ? buffer[offset]! | (buffer[offset + 1]! << 8)
          : (buffer[offset]! << 8) | buffer[offset + 1]!;

      case 'uint32':
        if (endianness === 'LE') {
          return (
            (buffer[offset]! |
              (buffer[offset + 1]! << 8) |
              (buffer[offset + 2]! << 16) |
              (buffer[offset + 3]! << 24)) >>>
            0
          );
        } else {
          return (
            ((buffer[offset]! << 24) |
              (buffer[offset + 1]! << 16) |
              (buffer[offset + 2]! << 8) |
              buffer[offset + 3]!) >>>
            0
          );
        }

      case 'int8':
        const u8 = buffer[offset]!;
        return u8 > 127 ? u8 - 256 : u8;

      case 'int16':
        const u16 =
          endianness === 'LE'
            ? buffer[offset]! | (buffer[offset + 1]! << 8)
            : (buffer[offset]! << 8) | buffer[offset + 1]!;
        return u16 > 32767 ? u16 - 65536 : u16;

      case 'int32':
        let u32 = 0;
        if (endianness === 'LE') {
          u32 =
            (buffer[offset]! |
              (buffer[offset + 1]! << 8) |
              (buffer[offset + 2]! << 16) |
              (buffer[offset + 3]! << 24)) >>>
            0;
        } else {
          u32 =
            ((buffer[offset]! << 24) |
              (buffer[offset + 1]! << 16) |
              (buffer[offset + 2]! << 8) |
              buffer[offset + 3]!) >>>
            0;
        }
        return u32 > 2147483647 ? u32 - 4294967296 : u32;

      case 'float32':
        return readFloat32(buffer, offset, endianness);

      case 'float64':
        return readFloat64(buffer, offset, endianness);

      case 'bytes':
        return buffer.slice(offset, offset + byteLength);

      case 'ascii':
        return decodeASCII(buffer, offset, byteLength);

      default:
        const _never: never = type;
        throw new Error(`Unknown type: ${_never}`);
    }
  };
}

/**
 * Reads a float32 from the buffer.
 */
function readFloat32(buffer: Uint8Array, offset: number, endianness: Endianness): number {
  // Converts 4 bytes to a uint32, then interprets as float32
  let u32: number;
  if (endianness === 'LE') {
    u32 =
      (buffer[offset]! |
        (buffer[offset + 1]! << 8) |
        (buffer[offset + 2]! << 16) |
        (buffer[offset + 3]! << 24)) >>>
      0;
  } else {
    u32 =
      ((buffer[offset]! << 24) |
        (buffer[offset + 1]! << 16) |
        (buffer[offset + 2]! << 8) |
        buffer[offset + 3]!) >>>
      0;
  }

  // Interprets bit by bit as float32 (IEEE 754)
  const sign = (u32 >> 31) & 1 ? -1 : 1;
  const exponent = (u32 >> 23) & 0xff;
  const mantissa = u32 & 0x7fffff;

  if (exponent === 0) {
    return mantissa === 0 ? sign * 0 : sign * Math.pow(2, -126) * (mantissa / 0x800000);
  }
  if (exponent === 0xff) {
    return mantissa === 0 ? sign * Infinity : NaN;
  }

  return sign * Math.pow(2, exponent - 127) * (1 + mantissa / 0x800000);
}

/**
 * Reads a float64 from the buffer.
 */
function readFloat64(buffer: Uint8Array, offset: number, endianness: Endianness): number {
  let lo: number, hi: number;

  if (endianness === 'LE') {
    lo =
      (buffer[offset]! |
        (buffer[offset + 1]! << 8) |
        (buffer[offset + 2]! << 16) |
        (buffer[offset + 3]! << 24)) >>>
      0;
    hi =
      (buffer[offset + 4]! |
        (buffer[offset + 5]! << 8) |
        (buffer[offset + 6]! << 16) |
        (buffer[offset + 7]! << 24)) >>>
      0;
  } else {
    hi =
      ((buffer[offset]! << 24) |
        (buffer[offset + 1]! << 16) |
        (buffer[offset + 2]! << 8) |
        buffer[offset + 3]!) >>>
      0;
    lo =
      ((buffer[offset + 4]! << 24) |
        (buffer[offset + 5]! << 16) |
        (buffer[offset + 6]! << 8) |
        buffer[offset + 7]!) >>>
      0;
  }

  // IEEE 754 double precision
  const sign = (hi >> 31) & 1 ? -1 : 1;
  const exponent = (hi >> 20) & 0x7ff;
  const mantissa = ((hi & 0xfffff) * Math.pow(2, 32)) + lo;

  if (exponent === 0) {
    return mantissa === 0 ? sign * 0 : sign * Math.pow(2, -1022) * (mantissa / Math.pow(2, 52));
  }
  if (exponent === 0x7ff) {
    return mantissa === 0 ? sign * Infinity : NaN;
  }

  return sign * Math.pow(2, exponent - 1023) * (1 + mantissa / Math.pow(2, 52));
}

/**
 * Decodes an ASCII string from a buffer.
 */
function decodeASCII(buffer: Uint8Array, offset: number, byteLength: number): string {
  let result = '';
  for (let i = 0; i < byteLength; i++) {
    const byte = buffer[offset + i];
    if (byte === undefined) break;
    result += String.fromCharCode(byte);
  }
  return result;
}
