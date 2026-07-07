import { SchemaEncodeError, SchemaParseError } from './errors.js';
import type { PrimitiveType } from './core/schema.js';

export type LayoutEndian = 'le' | 'be';
export type BitOrder = 'lsb' | 'msb';

const DEFAULT_ENDIAN: LayoutEndian = 'le';

interface NumericOptions {
  readonly endian?: LayoutEndian;
  readonly align?: number;
}

interface PrimitiveDescriptor<TType extends PrimitiveType, TSize extends number> {
  readonly kind: 'primitive';
  readonly primitiveType: TType;
  readonly size: TSize;
  readonly endian: LayoutEndian;
  readonly align?: number;
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

type NumericPrimitiveDescriptor = PrimitiveDescriptor<NumericPrimitiveType, number>;
type LengthPrefixPrimitiveType = 'uint8' | 'uint16' | 'uint32';
type LengthPrefixPrimitiveDescriptor = PrimitiveDescriptor<LengthPrefixPrimitiveType, number>;

interface BytesFromFieldDescriptor {
  readonly kind: 'bytes-from-field';
  readonly lengthFrom: string;
}

interface BytesPrefixedDescriptor {
  readonly kind: 'bytes-prefixed';
  readonly prefix: LengthPrefixPrimitiveDescriptor;
}

interface ArrayDescriptor<TItem extends NumericPrimitiveDescriptor = NumericPrimitiveDescriptor> {
  readonly kind: 'array';
  readonly item: TItem;
  readonly length: number | string;
}

interface PaddingDescriptor {
  readonly kind: 'padding';
  readonly bytes: number;
}

type BitfieldFields = Record<string, number>;

interface BitfieldDescriptor<TFields extends BitfieldFields = BitfieldFields> {
  readonly kind: 'bitfield';
  readonly fields: TFields;
  readonly order: BitOrder;
  readonly totalBits: number;
}

type FieldDescriptor =
  | NumericPrimitiveDescriptor
  | BytesFromFieldDescriptor
  | BytesPrefixedDescriptor
  | ArrayDescriptor
  | PaddingDescriptor
  | BitfieldDescriptor;

type DescriptorMap = Record<string, FieldDescriptor>;

type InferPrimitiveValue<P extends PrimitiveDescriptor<PrimitiveType, number>> =
  P extends PrimitiveDescriptor<NumericPrimitiveType, number>
    ? number
    : never;

type InferBitfieldValue<TFields extends BitfieldFields> = {
  [K in keyof TFields]: number;
};

type InferFieldValue<TField extends FieldDescriptor> =
  TField extends PrimitiveDescriptor<NumericPrimitiveType, number>
    ? InferPrimitiveValue<TField>
    : TField extends BytesFromFieldDescriptor
      ? Uint8Array
      : TField extends BytesPrefixedDescriptor
        ? Uint8Array
        : TField extends ArrayDescriptor<NumericPrimitiveDescriptor>
          ? number[]
          : TField extends BitfieldDescriptor<infer TBitfield>
            ? InferBitfieldValue<TBitfield>
            : never;

export type InferObjectType<TFields extends DescriptorMap> = {
  [K in keyof TFields as InferFieldValue<TFields[K]> extends never ? never : K]: InferFieldValue<TFields[K]>;
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
): PrimitiveDescriptor<TType, TSize> {
  if (options?.align !== undefined && (!Number.isInteger(options.align) || options.align <= 0)) {
    throw new SchemaEncodeError('align must be a positive integer', null, 'INVALID_ALIGN');
  }

  const base: PrimitiveDescriptor<TType, TSize> = {
    kind: 'primitive',
    primitiveType,
    size,
    endian: options?.endian ?? DEFAULT_ENDIAN,
  };

  if (options?.align !== undefined) {
    return {
      ...base,
      align: options.align,
    };
  }

  return base;
}

export function u8(options?: NumericOptions): PrimitiveDescriptor<'uint8', 1> {
  return numericPrimitive('uint8', 1, options);
}

export function u16(options?: NumericOptions): PrimitiveDescriptor<'uint16', 2> {
  return numericPrimitive('uint16', 2, options);
}

export function u32(options?: NumericOptions): PrimitiveDescriptor<'uint32', 4> {
  return numericPrimitive('uint32', 4, options);
}

export function i8(options?: NumericOptions): PrimitiveDescriptor<'int8', 1> {
  return numericPrimitive('int8', 1, options);
}

export function i16(options?: NumericOptions): PrimitiveDescriptor<'int16', 2> {
  return numericPrimitive('int16', 2, options);
}

export function i32(options?: NumericOptions): PrimitiveDescriptor<'int32', 4> {
  return numericPrimitive('int32', 4, options);
}

export function f32(options?: NumericOptions): PrimitiveDescriptor<'float32', 4> {
  return numericPrimitive('float32', 4, options);
}

export function f64(options?: NumericOptions): PrimitiveDescriptor<'float64', 8> {
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
      lengthFrom: lengthOrOptions,
    };
  }

  return {
    kind: 'bytes-prefixed',
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
    item,
    length: options.length,
  };
}

export function padding(bytesToSkip: number): PaddingDescriptor {
  if (!Number.isInteger(bytesToSkip) || bytesToSkip <= 0) {
    throw new SchemaEncodeError('padding(n) requires a positive integer', null, 'INVALID_PADDING');
  }

  return {
    kind: 'padding',
    bytes: bytesToSkip,
  };
}

export function bitfield<const TFields extends BitfieldFields>(
  fields: TFields,
  options?: { readonly order?: BitOrder },
): BitfieldDescriptor<TFields> {
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    throw new SchemaEncodeError('bitfield requires at least one field', null, 'INVALID_BITFIELD');
  }

  let totalBits = 0;
  for (const [name, bits] of entries) {
    if (!Number.isInteger(bits) || bits <= 0 || bits > 32) {
      throw new SchemaEncodeError(
        `bitfield '${name}' must have 1..32 bits`,
        name,
        'INVALID_BIT_COUNT',
      );
    }
    totalBits += bits;
  }

  return {
    kind: 'bitfield',
    fields,
    order: options?.order ?? 'lsb',
    totalBits,
  };
}

export function object<const TFields extends DescriptorMap>(
  fields: TFields,
): CompiledObjectLayout<InferObjectType<TFields>> {
  const entries = Object.entries(fields) as Array<[keyof TFields & string, TFields[keyof TFields]]>;
  validateComposition(entries);

  const staticSize = isStaticLayout(entries)
    ? computeLayoutSizeStatic(entries)
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

function validateComposition(entries: Array<[string, FieldDescriptor]>): void {
  let bitOffset = 0;

  for (const [fieldName, descriptor] of entries) {
    if (descriptor.kind === 'bitfield') {
      bitOffset += descriptor.totalBits;
      continue;
    }

    if (bitOffset % 8 !== 0) {
      throw new SchemaEncodeError(
        `Field '${fieldName}' is byte-aligned but previous bitfield left partial byte`,
        fieldName,
        'BITFIELD_BYTE_ALIGNMENT_VIOLATION',
      );
    }

    const aligned = alignBitOffset(bitOffset, descriptor.kind === 'primitive' ? descriptor.align : undefined);
    bitOffset = aligned + descriptorBitSizeForValidation(descriptor);
  }
}

function descriptorBitSizeForValidation(descriptor: FieldDescriptor): number {
  if (descriptor.kind === 'primitive') {
    return descriptor.size * 8;
  }
  if (descriptor.kind === 'bytes-prefixed') {
    return descriptor.prefix.size * 8;
  }
  if (descriptor.kind === 'bytes-from-field' || descriptor.kind === 'array') {
    return 0;
  }
  if (descriptor.kind === 'padding') {
    return descriptor.bytes * 8;
  }
  return descriptor.totalBits;
}

function isStaticLayout(entries: Array<[string, FieldDescriptor]>): boolean {
  return entries.every(([, descriptor]) => {
    if (descriptor.kind === 'primitive' || descriptor.kind === 'padding' || descriptor.kind === 'bitfield') {
      return true;
    }
    if (descriptor.kind === 'array') {
      return typeof descriptor.length === 'number';
    }
    return false;
  });
}

function computeLayoutSizeStatic(entries: Array<[string, FieldDescriptor]>): number {
  let bitOffset = 0;

  for (const [, descriptor] of entries) {
    if (descriptor.kind === 'bitfield') {
      bitOffset += descriptor.totalBits;
      continue;
    }

    bitOffset = alignBitOffset(bitOffset, descriptor.kind === 'primitive' ? descriptor.align : undefined);

    if (descriptor.kind === 'primitive') {
      bitOffset += descriptor.size * 8;
    } else if (descriptor.kind === 'padding') {
      bitOffset += descriptor.bytes * 8;
    } else if (descriptor.kind === 'array') {
      if (typeof descriptor.length !== 'number') {
        throw new SchemaEncodeError('array length is dynamic', null, 'DYNAMIC_SIZE');
      }
      bitOffset += descriptor.length * descriptor.item.size * 8;
    }
  }

  return Math.ceil(bitOffset / 8);
}

function computeLayoutSize(entries: Array<[string, FieldDescriptor]>, input: Record<string, unknown>): number {
  let bitOffset = 0;

  for (const [fieldName, descriptor] of entries) {
    if (descriptor.kind === 'bitfield') {
      const value = input[fieldName];
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new SchemaEncodeError(`Field '${fieldName}' must be an object`, fieldName, 'INVALID_FIELD_TYPE');
      }
      bitOffset += descriptor.totalBits;
      continue;
    }

    bitOffset = alignBitOffset(bitOffset, descriptor.kind === 'primitive' ? descriptor.align : undefined);

    if (descriptor.kind === 'primitive') {
      bitOffset += descriptor.size * 8;
      continue;
    }

    if (descriptor.kind === 'padding') {
      bitOffset += descriptor.bytes * 8;
      continue;
    }

    if (descriptor.kind === 'bytes-from-field') {
      bitOffset += resolveLengthFromInput(input, descriptor.lengthFrom, fieldName) * 8;
      continue;
    }

    if (descriptor.kind === 'bytes-prefixed') {
      const value = input[fieldName];
      if (!(value instanceof Uint8Array)) {
        throw new SchemaEncodeError(`Field '${fieldName}' must be Uint8Array`, fieldName, 'INVALID_FIELD_TYPE');
      }
      bitOffset += descriptor.prefix.size * 8;
      bitOffset += value.length * 8;
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
    bitOffset += arrayLength * descriptor.item.size * 8;
  }

  return Math.ceil(bitOffset / 8);
}

function encodeLayout(entries: Array<[string, FieldDescriptor]>, input: Record<string, unknown>): Uint8Array {
  const totalSize = computeLayoutSize(entries, input);
  const buffer = new Uint8Array(totalSize);
  let bitOffset = 0;

  for (const [fieldName, descriptor] of entries) {
    if (descriptor.kind === 'bitfield') {
      const source = input[fieldName];
      if (typeof source !== 'object' || source === null || Array.isArray(source)) {
        throw new SchemaEncodeError(`Field '${fieldName}' must be an object`, fieldName, 'INVALID_FIELD_TYPE');
      }
      writeBitfield(buffer, bitOffset, descriptor, source as Record<string, unknown>, fieldName);
      bitOffset += descriptor.totalBits;
      continue;
    }

    bitOffset = alignBitOffset(bitOffset, descriptor.kind === 'primitive' ? descriptor.align : undefined);
    const byteOffset = bitOffset / 8;

    if (descriptor.kind === 'primitive') {
      writePrimitive(buffer, byteOffset, descriptor, input[fieldName], fieldName);
      bitOffset += descriptor.size * 8;
      continue;
    }

    if (descriptor.kind === 'padding') {
      bitOffset += descriptor.bytes * 8;
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
      buffer.set(value, byteOffset);
      bitOffset += expectedLength * 8;
      continue;
    }

    if (descriptor.kind === 'bytes-prefixed') {
      const value = input[fieldName];
      if (!(value instanceof Uint8Array)) {
        throw new SchemaEncodeError(`Field '${fieldName}' must be Uint8Array`, fieldName, 'INVALID_FIELD_TYPE');
      }
      writePrimitive(buffer, byteOffset, descriptor.prefix, value.length, fieldName);
      bitOffset += descriptor.prefix.size * 8;
      buffer.set(value, bitOffset / 8);
      bitOffset += value.length * 8;
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
      writePrimitive(buffer, bitOffset / 8, descriptor.item, value, fieldName);
      bitOffset += descriptor.item.size * 8;
    }
  }

  return buffer;
}

function decodeLayout(entries: Array<[string, FieldDescriptor]>, buffer: Uint8Array, offset: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let bitOffset = offset * 8;

  for (const [fieldName, descriptor] of entries) {
    if (descriptor.kind === 'bitfield') {
      result[fieldName] = readBitfield(buffer, bitOffset, descriptor, fieldName);
      bitOffset += descriptor.totalBits;
      continue;
    }

    bitOffset = alignBitOffset(bitOffset, descriptor.kind === 'primitive' ? descriptor.align : undefined);
    const byteOffset = bitOffset / 8;

    if (descriptor.kind === 'primitive') {
      result[fieldName] = readPrimitive(buffer, byteOffset, descriptor, fieldName);
      bitOffset += descriptor.size * 8;
      continue;
    }

    if (descriptor.kind === 'padding') {
      bitOffset += descriptor.bytes * 8;
      continue;
    }

    if (descriptor.kind === 'bytes-from-field') {
      const length = resolveLengthFromRecord(result, descriptor.lengthFrom, fieldName);
      ensureBounds(buffer, byteOffset, length, fieldName);
      result[fieldName] = buffer.subarray(byteOffset, byteOffset + length);
      bitOffset += length * 8;
      continue;
    }

    if (descriptor.kind === 'bytes-prefixed') {
      const dynamicLength = readPrimitive(buffer, byteOffset, descriptor.prefix, fieldName);
      if (dynamicLength < 0 || !Number.isInteger(dynamicLength)) {
        throw new SchemaParseError(
          `Invalid dynamic length for field '${fieldName}'`,
          byteOffset,
          fieldName,
          'INVALID_DYNAMIC_LENGTH',
        );
      }
      bitOffset += descriptor.prefix.size * 8;
      const payloadOffset = bitOffset / 8;
      ensureBounds(buffer, payloadOffset, dynamicLength, fieldName);
      result[fieldName] = buffer.subarray(payloadOffset, payloadOffset + dynamicLength);
      bitOffset += dynamicLength * 8;
      continue;
    }

    const arrayLength = typeof descriptor.length === 'number'
      ? descriptor.length
      : resolveLengthFromRecord(result, descriptor.length, fieldName);

    const values: number[] = [];
    for (let index = 0; index < arrayLength; index++) {
      values.push(readPrimitive(buffer, bitOffset / 8, descriptor.item, fieldName));
      bitOffset += descriptor.item.size * 8;
    }
    result[fieldName] = values;
  }

  return result;
}

function alignBitOffset(bitOffset: number, align?: number): number {
  if (align === undefined) {
    return bitOffset;
  }

  if (bitOffset % 8 !== 0) {
    throw new SchemaEncodeError(
      'Cannot align a field when cursor is not byte-aligned',
      null,
      'BITFIELD_BYTE_ALIGNMENT_VIOLATION',
    );
  }

  const bytes = bitOffset / 8;
  const alignedBytes = Math.ceil(bytes / align) * align;
  return alignedBytes * 8;
}

function writeBitfield(
  buffer: Uint8Array,
  startBitOffset: number,
  descriptor: BitfieldDescriptor,
  source: Record<string, unknown>,
  fieldName: string,
): void {
  let localBitOffset = 0;

  for (const [bitName, bitCount] of Object.entries(descriptor.fields)) {
    const rawValue = source[bitName];
    if (typeof rawValue !== 'number') {
      throw new SchemaEncodeError(
        `Bitfield '${fieldName}.${bitName}' must be a number`,
        fieldName,
        'INVALID_FIELD_TYPE',
      );
    }

    const maxValue = Math.pow(2, bitCount) - 1;
    assertIntegerRange(rawValue, 0, maxValue, `${fieldName}.${bitName}`, 'uint32');

    for (let i = 0; i < bitCount; i++) {
      const bit = descriptor.order === 'lsb'
        ? (rawValue >> i) & 1
        : (rawValue >> (bitCount - 1 - i)) & 1;

      setBit(buffer, startBitOffset + localBitOffset + i, descriptor.order, bit);
    }

    localBitOffset += bitCount;
  }
}

function readBitfield(
  buffer: Uint8Array,
  startBitOffset: number,
  descriptor: BitfieldDescriptor,
  fieldName: string,
): Record<string, number> {
  const output: Record<string, number> = {};
  let localBitOffset = 0;

  for (const [bitName, bitCount] of Object.entries(descriptor.fields)) {
    let value = 0;

    for (let i = 0; i < bitCount; i++) {
      const bit = getBit(buffer, startBitOffset + localBitOffset + i, descriptor.order, fieldName);
      if (descriptor.order === 'lsb') {
        value |= bit << i;
      } else {
        value = (value << 1) | bit;
      }
    }

    output[bitName] = value;
    localBitOffset += bitCount;
  }

  return output;
}

function setBit(buffer: Uint8Array, absoluteBitOffset: number, order: BitOrder, bit: number): void {
  const byteIndex = Math.floor(absoluteBitOffset / 8);
  const indexInByte = absoluteBitOffset % 8;
  const bitIndex = order === 'lsb' ? indexInByte : 7 - indexInByte;

  if (bit === 1) {
    buffer[byteIndex] = (buffer[byteIndex] ?? 0) | (1 << bitIndex);
  }
}

function getBit(buffer: Uint8Array, absoluteBitOffset: number, order: BitOrder, fieldName: string): number {
  const byteIndex = Math.floor(absoluteBitOffset / 8);
  const indexInByte = absoluteBitOffset % 8;
  const bitIndex = order === 'lsb' ? indexInByte : 7 - indexInByte;

  const byte = buffer[byteIndex];
  if (byte === undefined) {
    throw new SchemaParseError(
      `Insufficient buffer while reading bitfield '${fieldName}'`,
      byteIndex,
      fieldName,
      'BUFFER_UNDERRUN',
    );
  }

  return (byte >> bitIndex) & 1;
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
