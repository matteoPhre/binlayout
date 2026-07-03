/**
 * Parser binario: compilazione e parsing di schema.
 *
 * Strategy per zero-alloc:
 * - compileSchema() viene chiamato una volta, può allocare strutture dati intermedie.
 * - parse() / parseInto() non allocano oltre all'oggetto risultato (o riusano quello fornito).
 * - Ogni campo ha una "reader function" precompilata e specializzata per tipo/endianness.
 * - Campi variabili vengono gestiti calcolando la lunghezza dal valore di un campo precedente.
 */

import {
  type Endianness,
  type PrimitiveType,
  PRIMITIVE_BYTE_SIZES,
  type SchemaDef,
} from './schema.js';
import { SchemaCompileError, SchemaParseError } from '../errors.js';

/**
 * Funzione specializzata per leggere un campo da un buffer.
 * Per campi fissi, offset è noto.
 * Per campi variabili, la lunghezza dipende da un precedente campo.
 *
 * Ritorna il valore letto.
 */
type FieldReader = (buffer: Uint8Array, offset: number) => number | Uint8Array | string;

/**
 * Definizione precompilata di come leggere un campo.
 * Discriminated union per fissi vs variabili.
 */
type CompiledFieldDef =
  | {
      readonly type: 'fixed';
      readonly name: string;
      readonly offset: number; // offset assoluto noto
      readonly byteLength: number; // lunghezza fissa
      readonly reader: FieldReader;
    }
  | {
      readonly type: 'variable';
      readonly name: string;
      readonly offset: number; // offset assoluto noto fino a questo punto
      readonly lengthFromFieldName: string; // nome del campo precedente che contiene la lunghezza
      readonly reader: (buffer: Uint8Array, offset: number, length: number) => Uint8Array | string; // reader che accetta length
    };

/**
 * Schema compilato, pronto per il parsing ripetuto zero-alloc.
 */
export interface CompiledSchema<_S extends SchemaDef = SchemaDef> {
  readonly name: string;
  readonly byteLength: number | null; // null se contiene campi variabili
  readonly fields: readonly CompiledFieldDef[];

  /**
   * Esegue il parsing di un buffer e ritorna un oggetto con i campi tipizzati.
   */
  parse(buffer: Uint8Array, offset?: number): any; // tipizzato da InferSchemaType<S>

  /**
   * Esegue il parsing di un buffer riusando un oggetto target.
   * Zero-alloc: non crea un nuovo oggetto, ma popola il target fornito.
   */
  parseInto(buffer: Uint8Array, target: any, offset?: number): any;
}

/**
 * Compila uno schema una tantum.
 * Verifica la validità dello schema, calcola gli offset, genera le reader function specializzate.
 *
 * Throws SchemaCompileError se lo schema è malformato.
 */
export function compileSchema<const S extends SchemaDef>(schema: S): CompiledSchema<S> {
  const compiledFields: CompiledFieldDef[] = [];
  let runningOffset = 0;
  let hasVariableFields = false;

  // Primo passaggio: valida e raccoglie info
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

  // Secondo passaggio: compila i campi
  for (const field of schema.fields) {
    // Determina offset: esplicito o calcolato
    const fieldOffset = field.offset !== undefined ? field.offset : runningOffset;

    // Calcola lunghezza del campo
    const baseByteSize = PRIMITIVE_BYTE_SIZES[field.type];
    const isVariable = baseByteSize === null && field.length === undefined && field.lengthFrom !== undefined;

    if (isVariable) {
      // Campi variabili: bytes/ascii con lengthFrom
      if (field.lengthFrom === undefined) {
        throw new SchemaCompileError(
          `Field '${field.name}' is variable-length but has no 'lengthFrom'`,
          'VARIABLE_LENGTH_WITHOUT_SIZE',
        );
      }

      // Verifica che il campo referenziato esiste e è precedente
      const lengthFromIndex = compiledFields.findIndex((f) => f.name === field.lengthFrom);
      if (lengthFromIndex === -1) {
        throw new SchemaCompileError(
          `Field '${field.name}' references non-existent lengthFrom field '${field.lengthFrom}'`,
          'INVALID_LENGTH_FROM',
        );
      }

      // Verifica che il campo referenziato è di tipo numerico
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

      // Genera reader per campo variabile
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
      // Non aggiornare runningOffset per campi variabili (non sappiamo la lunghezza a compile time)
    } else {
      // Campi fissi
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

      // Verifica sovrapposizioni (solo tra campi fissi)
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

      // Genera reader function specializzata
      const endianness = field.endianness ?? schema.endianness;
      const reader = makeFieldReader(field.type, byteLength, endianness);

      compiledFields.push({
        type: 'fixed',
        name: field.name,
        offset: fieldOffset,
        byteLength,
        reader,
      });

      // Aggiorna running offset (per il prossimo campo, solo se non è variabile il precedente)
      if (field.offset === undefined && !hasVariableFields) {
        runningOffset = fieldOffset + byteLength;
      }
    }
  }

  // Calcola lunghezza totale dello schema
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

  // Ritorna lo schema compilato
  return {
    name: schema.name,
    byteLength: totalByteLength,
    fields: compiledFields,

    parse(buffer: Uint8Array, offset = 0): any {
      const result: any = {};

      for (const field of compiledFields) {
        if (field.type === 'fixed') {
          const value = field.reader(buffer, offset + field.offset);
          result[field.name] = value;
        } else {
          // Campo variabile: leggi la lunghezza dal campo precedente
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

    parseInto(buffer: Uint8Array, target: any, offset = 0): any {
      for (const field of compiledFields) {
        if (field.type === 'fixed') {
          const value = field.reader(buffer, offset + field.offset);
          target[field.name] = value;
        } else {
          // Campo variabile: leggi la lunghezza dal campo precedente
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
 * Crea un reader per campi a lunghezza variabile.
 * La lunghezza viene passata al momento del parsing.
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
 * Crea una FieldReader specializzata per il tipo, lunghezza e endianness forniti.
 * Per campi a lunghezza fissa.
 */
function makeFieldReader(type: PrimitiveType, byteLength: number, endianness: Endianness): FieldReader {
  return (buffer: Uint8Array, offset: number): number | Uint8Array | string => {
    // Verifica bounds
    if (offset + byteLength > buffer.length) {
      throw new SchemaParseError(
        `Insufficient buffer: expected at least ${byteLength} bytes at offset ${offset}, got ${buffer.length - offset}`,
        offset,
        null,
        'BUFFER_UNDERRUN',
      );
    }

    // Reader per tipo
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
 * Legge un float32 dal buffer.
 */
function readFloat32(buffer: Uint8Array, offset: number, endianness: Endianness): number {
  // Converti i 4 byte in un uint32, poi interpreta come float32
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

  // Interpreta bit per bit come float32 (IEEE 754)
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
 * Legge un float64 dal buffer.
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
 * Decodifica una stringa ASCII da un buffer.
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
