/**
 * Type inference for binary schemas.
 * Maps a schema to a native, typed TypeScript type.
 */

import type { FieldDef, SchemaDef } from './schema.js';

/**
 * Maps a primitive type to its corresponding TypeScript type.
 */
export type FieldTSType<F extends FieldDef> = F['type'] extends 'bytes'
  ? Uint8Array
  : F['type'] extends 'ascii'
    ? string
    : number; // all integers and floats become number

/**
 * Infers output type from a schema.
 * Produces an object with keys like field names and values typed by primitive type.
 *
 * Example:
 * ```ts
 * const schema = {
 *   name: 'Msg',
 *   endianness: 'LE',
 *   fields: [
 *     { name: 'cmd', type: 'uint8' },
 *     { name: 'value', type: 'uint16' },
 *   ] as const,
 * };
 *
 * type MsgType = InferSchemaType<typeof schema>;
 * // MsgType = { cmd: number; value: number }
 * ```
 */
export type InferSchemaType<S extends SchemaDef> = {
  [F in S['fields'][number] as F['name']]: FieldTSType<F>;
};
