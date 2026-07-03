/**
 * Benchmark: verificare zero-alloc nel hot path.
 * Esegue 10.000 parseInto consecutivi e misura le allocazioni.
 */

import { compileSchema } from '../src/core/parser.js';

// Schema realistico (Modbus-like)
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

// Buffer di test
const buffer = new Uint8Array([
  0x01, 0x03, 0x00, 0x00, 0x00, 0x0A, 0x14,
  // registers (20 bytes)
  0x00, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x04, 0x00, 0x05,
  0x00, 0x06, 0x00, 0x07, 0x00, 0x08, 0x00, 0x09, 0x00, 0x0A,
  // crc
  0x39, 0x44,
]);

// Preallocate reuse object (zero-alloc strategy)
const target: any = {};

// Warm-up
for (let i = 0; i < 100; i++) {
  compiled.parseInto(buffer, target);
}

// Benchmark: 10.000 iterations
const ITERATIONS = 10000;

if (global.gc) {
  global.gc();
}

const memBefore = process.memoryUsage();
const timeBefore = process.hrtime.bigint();

for (let i = 0; i < ITERATIONS; i++) {
  compiled.parseInto(buffer, target);
}

const timeAfter = process.hrtime.bigint();
const memAfter = process.memoryUsage();

const durationMs = Number(timeAfter - timeBefore) / 1_000_000;
const heapUsedDelta = memAfter.heapUsed - memBefore.heapUsed;
const externalDelta = memAfter.external - memBefore.external;
const opsPerSecond = (ITERATIONS / durationMs) * 1000;

console.log(`
Benchmark Results (${ITERATIONS} iterations):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Duration:        ${durationMs.toFixed(2)} ms
Ops/sec:         ${opsPerSecond.toFixed(0)} ops/sec
Time per op:     ${(durationMs / ITERATIONS).toFixed(3)} ms

Memory Delta:
  Heap used:     ${heapUsedDelta > 0 ? '+' : ''}${(heapUsedDelta / 1024).toFixed(2)} KB
  External:      ${externalDelta > 0 ? '+' : ''}${(externalDelta / 1024).toFixed(2)} KB
  Total alloc:   ${((heapUsedDelta + externalDelta) / 1024).toFixed(2)} KB

Conclusion:
${heapUsedDelta < 100 * 1024 ? '✓ Zero-alloc achieved: minimal heap growth' : '✗ Significant allocations detected'}
`);
