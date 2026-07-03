/**
 * Contract (interface) for Framing.
 *
 * The Framer is responsible for:
 * 1. Accumulating data chunks from a stream (serial, TCP, etc.)
 * 2. Detecting complete message boundaries
 * 3. Returning Frame objects containing complete messages
 *
 * Note: Concrete implementations (LengthPrefixedFramer, DelimiterFramer, etc.)
 * go in separate packages/modules, NOT in core binlayout.
 * This maintains "zero-dependencies" principle and allows users of just the parser
 * to not load framing logic.
 */

/**
 * A complete message extracted from a stream.
 * Contains binary data and optional timestamp.
 */
export interface Frame {
  /** The frame data (binary buffer). */
  readonly data: Uint8Array;

  /** Timestamp when frame was received (milliseconds epoch). */
  readonly timestamp: number;
}

/**
 * Contract for framing implementations (stateful).
 * Consumes incoming data and produces complete Frame objects.
 */
export interface Framer {
  /**
   * Feeds the framer with a chunk of data.
   * Can return 0, 1 or more complete frames if boundaries are detected.
   *
   * @param chunk Binary buffer to process.
   * @returns Array of complete Frame objects extracted (may be empty if frame not yet complete).
   */
  feed(chunk: Uint8Array): Frame[];

  /**
   * Resets internal framer state.
   * Useful after parsing errors to resynchronize.
   */
  reset(): void;
}
