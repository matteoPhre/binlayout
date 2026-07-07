import { compileSchema } from './core/parser.js';
import type { Endianness, FieldDef, PrimitiveType, SchemaDef } from './core/schema.js';

export type LayoutEndian = 'le' | 'be';

const DEFAULT_ENDIAN: LayoutEndian = 'le';

interface NumericOptions {
  readonly endian?: LayoutEndian;
}

interface PrimitiveDescriptor<TType extends PrimitiveType, TValue, TSize extends number> {
  readonly primitiveType: TType;
  readonly valueType: TValue;
  readonly size: TSize;
  readonly endian: LayoutEndian;
}

type PrimitiveDescriptorMap = Record<string, PrimitiveDescriptor<PrimitiveType, unknown, number>>;

type InferPrimitiveValue<P extends PrimitiveDescriptor<PrimitiveType, unknown, number>> =
  P extends PrimitiveDescriptor<'uint8' | 'uint16' | 'uint32' | 'int8' | 'int16' | 'int32' | 'float32' | 'float64', infer TValue, number>
    ? TValue
    : never;

export type InferObjectType<TFields extends PrimitiveDescriptorMap> = {
  [K in keyof TFields]: InferPrimitiveValue<TFields[K]>;
};

export interface CompiledObjectLayout<T> {
  readonly size: number;
  decode(buffer: Uint8Array, offset?: number): T;
  encode(input: T): Uint8Array;
}

function normalizeEndianness(endian: LayoutEndian): Endianness {
  return endian === 'le' ? 'LE' : 'BE';
}

function numericPrimitive<TType extends PrimitiveType, TSize extends number>(
  primitiveType: TType,
  size: TSize,
  options: NumericOptions | undefined,
): PrimitiveDescriptor<TType, number, TSize> {
  return {
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

export function object<const TFields extends PrimitiveDescriptorMap>(
  fields: TFields,
): CompiledObjectLayout<InferObjectType<TFields>> {
  const schemaFields: FieldDef[] = [];
  let offset = 0;

  for (const [name, descriptor] of Object.entries(fields)) {
    schemaFields.push({
      name,
      type: descriptor.primitiveType,
      offset,
      endianness: normalizeEndianness(descriptor.endian),
    });
    offset += descriptor.size;
  }

  const schema: SchemaDef = {
    name: 'ObjectLayout',
    endianness: 'LE',
    fields: schemaFields,
  };

  const compiled = compileSchema(schema);

  return {
    size: offset,
    decode(buffer: Uint8Array, startOffset = 0): InferObjectType<TFields> {
      return compiled.parse(buffer, startOffset) as InferObjectType<TFields>;
    },
    encode(input: InferObjectType<TFields>): Uint8Array {
      return compiled.encode(input as Record<string, unknown>);
    },
  };
}

export function size(layout: CompiledObjectLayout<unknown>): number {
  return layout.size;
}
