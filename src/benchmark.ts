/**
 * Benchmark: compare parseInto() vs parse() in a realistic scenario.
 *
 * Important:
 * - `process.memoryUsage()` reports retained memory snapshots, not exact allocations.
 * - Values can be noisy across runs due to V8/GC heuristics.
 *
 * Run: npm run build && node --expose-gc dist/benchmark.js
 */

import { compileSchema } from './core/parser.js';

// Realistic schema (Modbus-like): 6 numeric fields + 1 bytes + 1 uint16 CRC
const schema = {
  name: 'ModbusMsg',
  endianness: 'LE' as const,
  fields: [
    { name: 'slaveId', type: 'uint8' as const },
    { name: 'funcCode', type: 'uint8' as const },
    { name: 'regAddr', type: 'uint16' as const },
    { name: 'regCount', type: 'uint16' as const },
    { name: 'byteCount', type: 'uint8' as const },
    { name: 'registers', type: 'bytes' as const, length: 20 },
    { name: 'crc', type: 'uint16' as const },
  ] as const,
};

const compiled = compileSchema(schema);

const buffer = new Uint8Array([
  0x01, 0x03, 0x00, 0x00, 0x00, 0x0A, 0x14,
  0x00, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x04, 0x00, 0x05,
  0x00, 0x06, 0x00, 0x07, 0x00, 0x08, 0x00, 0x09, 0x00, 0x0A,
  0x39, 0x44,
]);

const ITERATIONS = 10000;

function formatSignedKB(bytes: number): string {
  const sign = bytes > 0 ? '+' : '';
  return `${sign}${(bytes / 1024).toFixed(2)} KB`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

// ============================================================================
// Test 1: parseInto() - reused target object
// ============================================================================

const target: Record<string, unknown> = {
  slaveId: 0,
  funcCode: 0,
  regAddr: 0,
  regCount: 0,
  byteCount: 0,
  registers: buffer.subarray(7, 27),
  crc: 0,
};

// Warm-up
for (let i = 0; i < 100; i++) {
  compiled.parseInto(buffer, target);
}

const parseIntoDurationsMs: number[] = [];
const parseIntoTotalDeltaBytes: number[] = [];
let parseIntoChecksum = 0;

for (let round = 0; round < 5; round++) {
  if (global.gc) {
    (global.gc as Function)();
  }

  const memBefore = process.memoryUsage();
  const timeBefore = process.hrtime.bigint();

  for (let i = 0; i < ITERATIONS; i++) {
    compiled.parseInto(buffer, target);
    const crcValue = target.crc;
    if (typeof crcValue === 'number') {
      parseIntoChecksum += crcValue;
    }
  }

  if (global.gc) {
    (global.gc as Function)();
  }

  const timeAfter = process.hrtime.bigint();
  const memAfter = process.memoryUsage();

  parseIntoDurationsMs.push(Number(timeAfter - timeBefore) / 1_000_000);
  parseIntoTotalDeltaBytes.push((memAfter.heapUsed - memBefore.heapUsed) + (memAfter.external - memBefore.external));
}

const duration1Ms = median(parseIntoDurationsMs);
const totalDelta1Bytes = median(parseIntoTotalDeltaBytes);
const ops1PerSecond = (ITERATIONS / duration1Ms) * 1000;
const bytesPerOp1 = totalDelta1Bytes / ITERATIONS;

// ============================================================================
// Test 2: parse() - creates a new object each call
// ============================================================================

// Warm-up
for (let i = 0; i < 100; i++) {
  compiled.parse(buffer);
}

const parseDurationsMs: number[] = [];
const parseTotalDeltaBytes: number[] = [];
let parseChecksum = 0;

for (let round = 0; round < 5; round++) {
  if (global.gc) {
    (global.gc as Function)();
  }

  const memBefore = process.memoryUsage();
  const timeBefore = process.hrtime.bigint();

  for (let i = 0; i < ITERATIONS; i++) {
    const parsed = compiled.parse(buffer);
    const crcValue = parsed.crc;
    if (typeof crcValue === 'number') {
      parseChecksum += crcValue;
    }
  }

  if (global.gc) {
    (global.gc as Function)();
  }

  const timeAfter = process.hrtime.bigint();
  const memAfter = process.memoryUsage();

  parseDurationsMs.push(Number(timeAfter - timeBefore) / 1_000_000);
  parseTotalDeltaBytes.push((memAfter.heapUsed - memBefore.heapUsed) + (memAfter.external - memBefore.external));
}

const duration2Ms = median(parseDurationsMs);
const totalDelta2Bytes = median(parseTotalDeltaBytes);
const ops2PerSecond = (ITERATIONS / duration2Ms) * 1000;
const bytesPerOp2 = totalDelta2Bytes / ITERATIONS;

// ============================================================================
// Report
// ============================================================================

// eslint-disable-next-line no-console
console.log(`
Benchmark Comparison (${ITERATIONS} iterations):
Median of 5 rounds (each round forced GC before/after)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 TEST 1: parseInto() with reused target
────────────────────────────────────────────────────────
Duration:        ${duration1Ms.toFixed(2)} ms
Ops/sec:         ${ops1PerSecond.toFixed(0)} ops/sec
Time per op:     ${((duration1Ms * 1000) / ITERATIONS).toFixed(3)} us
Retained/op:     ${bytesPerOp1.toFixed(1)} bytes
Checksum:        ${parseIntoChecksum}

Retained memory delta (heap+external):
  Total:         ${formatSignedKB(totalDelta1Bytes)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 TEST 2: parse() with new object creation
────────────────────────────────────────────────────────
Duration:        ${duration2Ms.toFixed(2)} ms
Ops/sec:         ${ops2PerSecond.toFixed(0)} ops/sec
Time per op:     ${((duration2Ms * 1000) / ITERATIONS).toFixed(3)} us
Retained/op:     ${bytesPerOp2.toFixed(1)} bytes
Checksum:        ${parseChecksum}

Retained memory delta (heap+external):
  Total:         ${formatSignedKB(totalDelta2Bytes)}

Comparison:
  parseInto() speedup: ${(((duration2Ms - duration1Ms) / duration2Ms) * 100).toFixed(1)}%
  Retained delta diff: ${formatSignedKB(totalDelta2Bytes - totalDelta1Bytes)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Notes:
  • This benchmark compares relative behavior on this runtime/machine.
  • Retained deltas are not exact per-op allocations and may be negative in some runs.
  • parseInto() removes per-call result-object creation, but bytes/ascii fields still create JS values.
`);

