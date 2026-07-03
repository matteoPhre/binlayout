import { describe, expect, it } from 'vitest';
import type { Frame } from '../../src/framing/framer.js';
import {
  decodeFramePayload,
  decodeFramesPayload,
  type PayloadParser,
  type TransportFrameDecoder,
} from '../../src/framing/payload.js';

interface Header {
  readonly packetType: string;
  readonly packetId: number;
}

interface ParsedMessage {
  readonly text: string;
}

describe('Framing payload decoding', () => {
  it('decodes transport header and parses application payload', () => {
    const frame: Frame = {
      data: new Uint8Array([0x4d, 0x10, 0x48, 0x49]),
      timestamp: 123,
    };

    const decoder: TransportFrameDecoder<Header, Uint8Array> = {
      decode(inputFrame) {
        return {
          header: {
            packetType: String.fromCharCode(inputFrame.data[0]!),
            packetId: inputFrame.data[1]!,
          },
          payload: inputFrame.data.subarray(2),
        };
      },
    };

    const parser: PayloadParser<Uint8Array, ParsedMessage> = {
      parse(payload) {
        return {
          text: String.fromCharCode(...payload),
        };
      },
    };

    const result = decodeFramePayload(frame, decoder, parser);

    expect(result.header.packetType).toBe('M');
    expect(result.header.packetId).toBe(0x10);
    expect(result.payload.text).toBe('HI');
    expect(result.frame.timestamp).toBe(123);
  });

  it('decodes and parses multiple frames', () => {
    const frames: Frame[] = [
      {
        data: new Uint8Array([0x4d, 0x10, 0x41]),
        timestamp: 1,
      },
      {
        data: new Uint8Array([0x50, 0x11, 0x42]),
        timestamp: 2,
      },
    ];

    const decoder: TransportFrameDecoder<Header, Uint8Array> = {
      decode(inputFrame) {
        return {
          header: {
            packetType: String.fromCharCode(inputFrame.data[0]!),
            packetId: inputFrame.data[1]!,
          },
          payload: inputFrame.data.subarray(2),
        };
      },
    };

    const parser: PayloadParser<Uint8Array, ParsedMessage> = {
      parse(payload) {
        return {
          text: String.fromCharCode(...payload),
        };
      },
    };

    const results = decodeFramesPayload(frames, decoder, parser);

    expect(results).toHaveLength(2);
    expect(results[0]!.header.packetType).toBe('M');
    expect(results[0]!.payload.text).toBe('A');
    expect(results[1]!.header.packetType).toBe('P');
    expect(results[1]!.payload.text).toBe('B');
  });
});
