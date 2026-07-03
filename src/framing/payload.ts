import type { Frame } from './framer.js';

/**
 * Raw transport-level decode result.
 *
 * `header` contains transport metadata (address, packet type, packet id, checksum bytes, etc.)
 * while `payload` is the extracted application-level raw payload.
 */
export interface DecodedTransportFrame<THeader, TRawPayload> {
  readonly frame: Frame;
  readonly header: THeader;
  readonly payload: TRawPayload;
}

/**
 * Transport decoder contract.
 * Responsible for splitting a framed packet into transport header + raw payload.
 */
export interface TransportFrameDecoder<THeader, TRawPayload> {
  decode(frame: Frame): {
    readonly header: THeader;
    readonly payload: TRawPayload;
  };
}

/**
 * Application payload parser contract.
 * Responsible for parsing the transport payload into a typed message.
 */
export interface PayloadParser<TRawPayload, TParsedPayload> {
  parse(payload: TRawPayload): TParsedPayload;
}

/**
 * Parsed application-level frame.
 */
export interface ParsedPayloadFrame<THeader, TParsedPayload> {
  readonly frame: Frame;
  readonly header: THeader;
  readonly payload: TParsedPayload;
}

/**
 * Decodes one transport frame and parses its payload.
 */
export function decodeFramePayload<THeader, TRawPayload, TParsedPayload>(
  frame: Frame,
  decoder: TransportFrameDecoder<THeader, TRawPayload>,
  parser: PayloadParser<TRawPayload, TParsedPayload>,
): ParsedPayloadFrame<THeader, TParsedPayload> {
  const decoded = decoder.decode(frame);
  const parsedPayload = parser.parse(decoded.payload);

  return {
    frame,
    header: decoded.header,
    payload: parsedPayload,
  };
}

/**
 * Decodes and parses a batch of frames.
 */
export function decodeFramesPayload<THeader, TRawPayload, TParsedPayload>(
  frames: readonly Frame[],
  decoder: TransportFrameDecoder<THeader, TRawPayload>,
  parser: PayloadParser<TRawPayload, TParsedPayload>,
): ParsedPayloadFrame<THeader, TParsedPayload>[] {
  const results: ParsedPayloadFrame<THeader, TParsedPayload>[] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    results.push(decodeFramePayload(frame, decoder, parser));
  }

  return results;
}
