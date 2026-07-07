// Core API
export { compileSchema, type CompiledSchema } from './core/parser.js';
export { defineSchema, type Endianness, type FieldDef, type PrimitiveType, type SchemaDef } from './core/schema.js';
export { type InferSchemaType } from './core/types.js';
export {
  array,
  bitfield,
  bytes,
  f32,
  f64,
  i8,
  i16,
  i32,
  object,
  padding,
  size,
  u8,
  u16,
  u32,
  type BitOrder,
  type CompiledObjectLayout,
  type InferObjectType,
  type LayoutEndian,
} from './layout';

// Validation
export {
  createValidationStrategy,
  type ValidationStrategyConfig,
  type ValidationValue,
  type ValidationStrategy,
} from './validation/strategies.js';

// Framing contracts
export { type Frame, type Framer } from './framing/framer.js';
export {
  decodeFramePayload,
  decodeFramesPayload,
  type DecodedTransportFrame,
  type ParsedPayloadFrame,
  type PayloadParser,
  type TransportFrameDecoder,
} from './framing/payload.js';

// Errors
export { SchemaCompileError, SchemaEncodeError, SchemaParseError, ValidationError } from './errors.js';
