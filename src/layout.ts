import { SchemaEncodeError, SchemaParseError } from './errors.js';
import type { PrimitiveType } from './core/schema.js';

export type LayoutEndian = 'le' | 'be';

const DEFAULT_ENDIAN: LayoutEndian = 'le';

interface NumericOptions {
  readonly endian?: LayoutEndian;
}

interface PrimitiveDescriptor<TType extends PrimitiveType, TValue, TSize extends number> {
  readonly kind: 'primitive';
  readonly primitiveType: TType;
  readonly valueType: TValue;
  readonly size: TSize;
  readonly endian: LayoutEndian;
}

type NumericPrimitiveType =
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'float32'
  | 'float64';

type NumericPrimitiveDescriptor = PrimitiveDescriptor<NumericPrimitiveType, number, number>;
type LengthPrefixPrimitiveType = 'uint8' | 'uint16' | 'uint32';
type LengthPrefixPrimitiveDescriptor = PrimitiveDescriptor<LengthPrefixPrimitiveType, number, number>;

interface BytesFromFieldDescriptor {
  readonly kind: 'bytes-from-field';
  readonly valueType: Uint8Array;
  readonly lengthFrom: string;
}

interface BytesPrefixedDescriptor {
  readonly kind: 'bytes-prefixed';
  readonly valueType: Uint8Array;
  readonly prefix: LengthPrefixPrimitiveDescriptor;
}

interface ArrayDescriptor<TItem extends NumericPrimitiveDescriptor = NumericPrimitiveDescriptor> {
  readonly kind: 'array';
  readonly valueType: ReadonlyArray<number>;
  readonly item: TItem;
  readonly length: number | string;
}

type FieldDescriptor = NumericPrimitiveDescriptor | BytesFromFieldDescriptor | BytesPrefixedDescriptor | ArrayDescriptor;
type DescriptorMap = Record<string, FieldDescriptor>;

type InferPrimitiveValue<P extends PrimitiveDescriptor<PrimitiveType, unknown, number>> =
  P extends PrimitiveDescriptor<NumericPrimitiveType, infer TValue, number>
    ? TValue
    : never;

type InferFieldValue<TField extends FieldDescriptor> =
  TField extends PrimitiveDescriptor<NumericPrimitiveType, unknown, number>
    ? InferPrimitiveValue<TField>
    : TField extends BytesFromFieldDescriptor
      ? Uint8Array
      : TField extends BytesPrefixedDescriptor
        ? Uint8Array
        : TField extends ArrayDescriptor<NumericPrimitiveDescriptor>
          ? number[]
          : never;

export type InferObjectType<TFields extends DescriptorMap> = {
  [K in keyof TFields]: InferFieldValue<TFields[K]>;
};

export interface CompiledObjectLayout<T> {
  readonly size: number | null;
  computeSize(input: T): number;
  decode(buffer: Uint8Array, offset?: number): T;
  encode(input: T): Uint8Array;
}

function numericPrimitive<TType extends PrimitiveType, TSize extends number>(
  primitiveType: TType,
  size: TSize,
  options: NumericOptions | undefined,
): PrimitiveDescriptor<TType, number, TSize> {
  return {
    kind: 'primitive',
    primitiveType,
    valueType: 0,
    size,
    endian: options?.endian ?? DEFAULT_ENDIAN,
  };
}

export function u8(options?: NumericOptions): PrimitiveDescriptor<'uint8', number, 1> {
  return numericPrimitive('uint8', 1, options);
}

export function u16(options?: NumericOptions): PrimitiveDescriptor<'uint16', number, 2> {
  return numericPrimitive('uint16', 2, options);
}

export function u32(options?: NumericOptions): PrimitiveDescriptor<'uint32', number, 4> {
  return numericPrimitive('uint32', 4, options);
}

export function i8(options?: NumericOptions): PrimitiveDescriptor<'int8', number, 1> {
  return numericPrimitive('int8', 1, options);
}

export function i16(options?: NumericOptions): PrimitiveDescriptor<'int16', number, 2> {
  return numericPrimitive('int16', 2, options);
}

export function i32(options?: NumericOptions): PrimitiveDescriptor<'int32', number, 4> {
  return numericPrimitive('int32', 4, options);
}

export function f32(options?: NumericOptions): PrimitiveDescriptor<'float32', number, 4> {
  return numericPrimitive('float32', 4, options);
}

export function f64(options?: NumericOptions): PrimitiveDescriptor<'float64', number, 8> {
  return numericPrimitive('float64', 8, options);
}

interface BytesPrefixOptions {
  readonly length: 'dynamic';
  readonly prefix: LengthPrefixPrimitiveDescriptor;
}

export function bytes(lengthFrom: string): BytesFromFieldDescriptor;
export function bytes(options: BytesPrefixOptions): BytesPrefixedDescriptor;
export function bytes(lengthOrOptions: string | BytesPrefixOptions): BytesFromFieldDescriptor | BytesPrefixedDescriptor {
  if (typeof lengthOrOptions === 'string') {
    return {
      kind: 'bytes-from-field',
      valueType: new Uint8Array(),
      lengthFrom: lengthOrOptions,
    };
  }

  return {
    kind: 'bytes-prefixed',
    valueType: new Uint8Array(),
    prefix: lengthOrOptions.prefix,
  };
}

interface ArrayOptions {
  readonly length: number | string;
}

export function array<TItem extends NumericPrimitiveDescriptor>(
  item: TItem,
  options: ArrayOptions,
): ArrayDescriptor<TItem> {
  return {
    kind: 'array',
    valueType: [],
    item,
    length: options.length,
  };
}

export function object<const TFields extends DescriptorMap>(
  fields: TFields,
): CompiledObjectLayout<InferObjectType<TFields>> {
  const entries = Object.entries(fields) as Array<[keyof TFields & string, TFields[keyof TFields]]>;

  const staticSize = isStaticLayout(entries)
    ? entries.reduce((total, [, descriptor]) => total + staticDescriptorSize(descriptor), 0)
    : null;

  return {
    size: staticSize,
    computeSize(input: InferObjectType<TFields>): number {
      return computeLayoutSize(entries, input as Record<string, unknown>);
    },
    decode(buffer: Uint8Array, startOffset = 0): InferObjectType<TFields> {
      return decodeLayout(entries, buffer, startOffset) as InferObjectType<TFields>;
    },
    encode(input: InferObjectType<TFields>): Uint8Array {
      return encodeLayout(entries, input as Record<string, unknown>);
    },
  };
}

export function size(layout: CompiledObjectLayout<unknown>): number | null {
  return layout.size;
}

function isStaticLayout(entries: Array<[string, FieldDescriptor]>): boolean {
  return entries.every(([, descriptor]) => {
    if (descriptor.kind === 'primitive') {
      return true;
    }
    if (descriptor.kind === 'array') {
      return typeof descriptor.length === 'number';
    }
    return false;
  });
}

function staticDescriptorSize(descriptor: FieldDescriptor): number {
  if (descriptor.kind === 'primitive') {
    return descriptor.size;
  }
  if (descriptor.kind === 'array') {
    if (typeof descriptor.length !== 'number') {
      throw new SchemaEncodeError('Array length is dynamic', null, 'DYNAMIC_SIZE');
    }
    return descriptor.length * descriptor.item.size;
  }
  throw new SchemaEncodeError('Descriptor has dynamic size', null, 'DYNAMIC_SIZE');
}

function computeLayoutSize(entries: Array<[string, FieldDescriptor]>, input: Record<string, unknown>): number {
  let cursor = 0;
  for (const [fieldName, descriptor] of entries) {
    if (descriptor.kind === 'primitive') {
      cursor += descriptor.size;
      continue;
    }

    if (descriptor.kind === 'bytes-from-field') {
      cursor += resolveLengthFromInput(input, descriptor.lengthFrom, fieldName);
      continue;
    }

    if (descriptor.kind === 'bytes-prefixed') {
      const value = input[fieldName];
      if (!(value instanceof Uint8Array)) {
        throw new SchemaEncodeError(`Field '${fieldName}' must be Uint8Array`, fieldName, 'INVALID_FIELD_TYPE');
      }
      cursor += descriptor.prefix.size + value.length;
      continue;
    }

    const arrayLength = resolveArrayLength(input, descriptor.length, fieldName);
    const value = input[fieldName];
    if (!Array.isArray(value)) {
      throw new SchemaEncodeError(`Field '${fieldName}' must be an array`, fieldName, 'INVALID_FIELD_TYPE');
    }
    if (value.length !== arrayLength) {
      throw new SchemaEncodeError(
        `Field '${fieldName}' length mismatch: expected ${arrayLength}, got ${value.length}`,
        fieldName,
        'LENGTH_MISMATCH',
      );
    }
    cursor += arrayLength * descriptor.item.size;
  }
  return cursor;
}

function encodeLayout(entries: Array<[string, FieldDescriptor]>, input: Record<string, unknown>): Uint8Array {
  const size = computeLayoutSize(entries, input);
  const buffer = new Uint8Array(size);
  let cursor = 0;

  for (const [fieldName, descriptor] of entries) {
    if (descriptor.kind === 'primitive') {
      writePrimitive(buffer, cursor, descriptor, input[fieldName], fieldName);
      cursor += descriptor.size;
      continue;
    }

    if (descriptor.kind === 'bytes-from-field') {
      const expectedLength = resolveLengthFromInput(input, descriptor.lengthFrom, fieldName);
      const value = input[fieldName];
      if (!(value instanceof Uint8Array)) {
        throw new SchemaEncodeError(`Field '${fieldName}' must be Uint8Array`, fieldName, 'INVALID_FIELD_TYPE');
      }
      if (value.length !== expectedLength) {
        throw new SchemaEncodeError(
          `Field '${fieldName}' length mismatch: expected ${expectedLength}, got ${value.length}`,
          fieldName,
          'LENGTH_MISMATCH',
        );
      }
      buffer.set(value, cursor);
      cursor += expectedLength;
      continue;
    }

    if (descriptor.kind === 'bytes-prefixed') {
      const value = input[fieldName];
      if (!(value instanceof Uint8Array)) {
        throw new SchemaEncodeError(`Field '${fieldName}' must be Uint8Array`, fieldName, 'INVALID_FIELD_TYPE');
      }
      writePrimitive(buffer, cursor, descriptor.prefix, value.length, fieldName);
      cursor += descriptor.prefix.size;
      buffer.set(value, cursor);
      cursor += value.length;
      continue;
    }

    const values = input[fieldName];
    if (!Array.isArray(values)) {
      throw new SchemaEncodeError(`Field '${fieldName}' must be an array`, fieldName, 'INVALID_FIELD_TYPE');
    }
    const expectedLength = resolveArrayLength(input, descriptor.length, fieldName);
    if (values.length !== expectedLength) {
      throw new SchemaEncodeError(
        `Field '${fieldName}' length mismatch: expected ${expectedLength}, got ${values.length}`,
        fieldName,
        'LENGTH_MISMATCH',
      );
    }
    for (const value of values) {
      writePrimitive(buffer, cursor, descriptor.item, value, fieldName);
      cursor += descriptor.item.size;
    }
  }

  return buffer;
}

function decodeLayout(entries: Array<[string, FieldDescriptor]>, buffer: Uint8Array, offset: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let cursor = offset;

  for (const [fieldName, descriptor] of entries) {
    if (descriptor.kind === 'primitive') {
      result[fieldName] = readPrimitive(buffer, cursor, descriptor, fieldName);
      cursor += descriptor.size;
      continue;
    }

    if (descriptor.kind === 'bytes-from-field') {
      const length = resolveLengthFromRecord(result, descriptor.lengthFrom, fieldName);
      ensureBounds(buffer, cursor, length, fieldName);
      result[fieldName] = buffer.subarray(cursor, cursor + length);
      cursor += length;
      continue;
    }

    if (descriptor.kind === 'bytes-prefixed') {
      const dynamicLength = readPrimitive(buffer, cursor, descriptor.prefix, fieldName);
      if (typeof dynamicLength !== 'number' || !Number.isInteger(dynamicLength) || dynamicLength < 0) {
        throw new SchemaParseError(
          `Invalid dynamic length for field '${fieldName}'`,
          cursor,
          fieldName,
          'INVALID_DYNAMIC_LENGTH',
        );
      }
      cursor += descriptor.prefix.size;
      ensureBounds(buffer, cursor, dynamicLength, fieldName);
      result[fieldName] = buffer.subarray(cursor, cursor + dynamicLength);
      cursor += dynamicLength;
      continue;
    }

    const arrayLength = typeof descriptor.length === 'number'
      ? descriptor.length
      : resolveLengthFromRecord(result, descriptor.length, fieldName);

    const values: number[] = [];
    for (let index = 0; index < arrayLength; index++) {
      const value = readPrimitive(buffer, cursor, descriptor.item, fieldName);
      if (typeof value !== 'number') {
        throw new SchemaParseError(
          `Array field '${fieldName}' item at index ${index} is not numeric`,
          cursor,
          fieldName,
          'INVALID_ARRAY_ITEM',
        );
      }
      values.push(value);
      cursor += descriptor.item.size;
    }
    result[fieldName] = values;
  }

  return result;
}

function resolveLengthFromInput(input: Record<string, unknown>, lengthFrom: string, fieldName: string): number {
  const value = input[lengthFrom];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new SchemaEncodeError(
      `Field '${fieldName}' references invalid length field '${lengthFrom}'`,
      fieldName,
      'INVALID_LENGTH_FROM_VALUE',
    );
  }
  return value;
}

function resolveLengthFromRecord(record: Record<string, unknown>, lengthFrom: string, fieldName: string): number {
  const value = record[lengthFrom];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new SchemaParseError(
      `Field '${fieldName}' references invalid length field '${lengthFrom}'`,
      0,
      fieldName,
      'INVALID_LENGTH_FROM_VALUE',
    );
  }
  return value;
}

function resolveArrayLength(input: Record<string, unknown>, length: number | string, fieldName: string): number {
  if (typeof length === 'number') {
    return length;
  }
  return resolveLengthFromInput(input, length, fieldName);
}

function ensureBounds(buffer: Uint8Array, offset: number, byteLength: number, fieldName: string): void {
  if (offset + byteLength > buffer.length) {
    throw new SchemaParseError(
      `Insufficient buffer for field '${fieldName}': expected ${byteLength} bytes`,
      offset,
      fieldName,
      'BUFFER_UNDERRUN',
    );
  }
}

function writePrimitive(
  buffer: Uint8Array,
  offset: number,
  descriptor: NumericPrimitiveDescriptor,
  value: unknown,
  fieldName: string,
): void {
  if (typeof value !== 'number') {
    throw new SchemaEncodeError(`Field '${fieldName}' must be a number`, fieldName, 'INVALID_FIELD_TYPE');
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  switch (descriptor.primitiveType) {
    case 'uint8':
      assertIntegerRange(value, 0, 0xff, fieldName, descriptor.primitiveType);
      view.setUint8(offset, value);
      return;
    case 'uint16':
      assertIntegerRange(value, 0, 0xffff, fieldName, descriptor.primitiveType);
      view.setUint16(offset, value, descriptor.endian === 'le');
      return;
    case 'uint32':
      assertIntegerRange(value, 0, 0xffff_ffff, fieldName, descriptor.primitiveType);
      view.setUint32(offset, value, descriptor.endian === 'le');
      return;
    case 'int8':
      assertIntegerRange(value, -0x80, 0x7f, fieldName, descriptor.primitiveType);
      view.setInt8(offset, value);
      return;
    case 'int16':
      assertIntegerRange(value, -0x8000, 0x7fff, fieldName, descriptor.primitiveType);
      view.setInt16(offset, value, descriptor.endian === 'le');
      return;
    case 'int32':
      assertIntegerRange(value, -0x8000_0000, 0x7fff_ffff, fieldName, descriptor.primitiveType);
      view.setInt32(offset, value, descriptor.endian === 'le');
      return;
    case 'float32':
      view.setFloat32(offset, value, descriptor.endian === 'le');
      return;
    case 'float64':
      view.setFloat64(offset, value, descriptor.endian === 'le');
      return;
    default: {
      const _never: never = descriptor.primitiveType;
      throw new SchemaEncodeError(`Unsupported primitive '${_never}'`, fieldName, 'UNSUPPORTED_TYPE');
    }
  }
}

function readPrimitive(
  buffer: Uint8Array,
  offset: number,
  descriptor: NumericPrimitiveDescriptor,
  fieldName: string,
): number {
  ensureBounds(buffer, offset, descriptor.size, fieldName);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  switch (descriptor.primitiveType) {
    case 'uint8':
      return view.getUint8(offset);
    case 'uint16':
      return view.getUint16(offset, descriptor.endian === 'le');
    case 'uint32':
      return view.getUint32(offset, descriptor.endian === 'le');
    case 'int8':
      return view.getInt8(offset);
    case 'int16':
      return view.getInt16(offset, descriptor.endian === 'le');
    case 'int32':
      return view.getInt32(offset, descriptor.endian === 'le');
    case 'float32':
      return view.getFloat32(offset, descriptor.endian === 'le');
    case 'float64':
      return view.getFloat64(offset, descriptor.endian === 'le');
    default: {
      const _never: never = descriptor.primitiveType;
      throw new SchemaParseError(`Unsupported primitive '${_never}'`, offset, fieldName, 'UNSUPPORTED_TYPE');
    }
  }
}

function assertIntegerRange(value: number, min: number, max: number, fieldName: string, type: NumericPrimitiveType): void {
  if (!Number.isInteger(value)) {
    throw new SchemaEncodeError(`Field '${fieldName}' must be an integer for '${type}'`, fieldName, 'INVALID_INTEGER');
  }
  if (value < min || value > max) {
    throw new SchemaEncodeError(
      `Field '${fieldName}' value ${value} out of range for '${type}' [${min}, ${max}]`,
      fieldName,
      'NUMERIC_OVERFLOW',
    );
  }
}
