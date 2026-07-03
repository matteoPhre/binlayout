/**
 * Definizioni di base per gli schema binari.
 */

/**
 * Ordine dei byte: Big Endian (BE) o Little Endian (LE).
 */
export type Endianness = 'BE' | 'LE';

/**
 * Tipi primitivi supportati nel formato binario.
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
  | 'bytes'  // slice grezzo, lunghezza fissa o dinamica
  | 'ascii'; // stringa a lunghezza fissa o terminata

/**
 * Definizione di un singolo campo binario.
 *
 * @template Name - Nome del campo (usato come chiave nel tipo di output)
 */
export interface FieldDef<Name extends string = string> {
  /** Nome univoco del campo nello schema. */
  readonly name: Name;

  /** Tipo primitivo del campo. */
  readonly type: PrimitiveType;

  /**
   * Endianness per questo campo.
   * Se omesso, usa il default dello schema.
   */
  readonly endianness?: Endianness;

  /**
   * Lunghezza fissa in byte (per 'bytes' e 'ascii').
   * Se omesso e type è 'bytes'/'ascii', il campo è considerato dinamico
   * e richiede 'lengthFrom'.
   */
  readonly length?: number;

  /**
   * Nome di un campo precedente che contiene la lunghezza di questo campo.
   * Usato per campi a lunghezza variabile.
   * Il campo referenziato deve essere di tipo numerico (uint8/uint16/uint32/int8/int16/int32).
   */
  readonly lengthFrom?: string;

  /**
   * Offset esplicito in byte dal inizio del buffer.
   * Se omesso, è calcolato automaticamente in sequenza dal compilatore.
   * Se specificato, il compilatore verifica che non vi siano sovrapposizioni.
   */
  readonly offset?: number;
}

/**
 * Definizione completa di uno schema binario.
 *
 * @template Fields - Array readonly dei FieldDef che compongono lo schema
 */
export interface SchemaDef<Fields extends readonly FieldDef[] = readonly FieldDef[]> {
  /** Nome simbolico dello schema (es. "ModbusRTUMessage"). */
  readonly name: string;

  /** Endianness di default per tutti i campi che non lo specificano esplicitamente. */
  readonly endianness: Endianness;

  /** Array readonly dei campi. Deve essere const-asserted per preservare i nomi letterali. */
  readonly fields: Fields;
}

/**
 * Mappa dei byte length per ogni tipo primitivo (quando è fisso).
 * Per 'bytes' e 'ascii', la lunghezza dipende dal campo specifico.
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
