/**
 * Contratto (interface) per Framing.
 *
 * Il Framer è responsabile di:
 * 1. Accumulare chunk di dati da un flusso (seriale, TCP, ecc.)
 * 2. Individuare i confini dei messaggi completi
 * 3. Ritornare Frame oggetti che contengono i messaggi completi
 *
 * Nota: Le implementazioni concrete (LengthPrefixedFramer, DelimiterFramer, ecc.)
 * vanno in pacchetti/moduli separati, NON nel core binlayout.
 * Questo mantiene il principio "zero-dipendenze" e permette a chi usa solo il parser
 * di non caricare logica di framing.
 */

/**
 * Un messaggio completo estratto da un flusso.
 * Contiene i dati binari e un timestamp opzionale.
 */
export interface Frame {
  /** I dati del frame (buffer binario). */
  readonly data: Uint8Array;

  /** Timestamp di quando il frame è stato ricevuto (millisecondi epoch). */
  readonly timestamp: number;
}

/**
 * Contratto per le implementazioni di framing (stateful).
 * Accoglie dati in ingresso e produce Frame completi.
 */
export interface Framer {
  /**
   * Alimenta il framer con un chunk di dati.
   * Può ritornare 0, 1 o più frame completi se ne individua i confini.
   *
   * @param chunk Buffer binario da elaborare.
   * @returns Array di Frame completi estratti (può essere vuoto se il frame non è ancora completo).
   */
  feed(chunk: Uint8Array): Frame[];

  /**
   * Resetta lo stato interno del framer.
   * Utile dopo errori di parsing per risincronizzarsi.
   */
  reset(): void;
}
