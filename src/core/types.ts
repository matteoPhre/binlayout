/**
 * Type inference per schema binari.
 * Mappa uno schema a un tipo TypeScript nativo e tipizzato.
 */

import type { FieldDef, SchemaDef } from './schema.js';

/**
 * Mappa un tipo primitivo al suo corrispondente TypeScript.
 */
export type FieldTSType<F extends FieldDef> = F['type'] extends 'bytes'
  ? Uint8Array
  : F['type'] extends 'ascii'
    ? string
    : number; // tutti gli integer e float diventano number

/**
 * Inferisce il tipo di output da uno schema.
 * Produce un oggetto con chiavi come i field names e valori tipizzati secondo il tipo primitivo.
 *
 * Esempio:
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
