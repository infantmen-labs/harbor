/**
 * Portable little-endian 64-bit encoders.
 *
 * Browser Buffer polyfills predate the BigInt read/write methods, so the
 * SDK must never call writeBigUInt64LE / writeBigInt64LE directly — any
 * bundler-shipped dapp (including our own web UI) would crash at runtime.
 * Index assignment works on every Buffer/Uint8Array implementation.
 */
export function writeU64LE(
  out: Uint8Array,
  v: bigint | number,
  offset: number
): void {
  let x = typeof v === "bigint" ? v : BigInt(v);
  if (x < 0n || x >= 1n << 64n) throw new RangeError("u64 out of range");
  for (let i = 0; i < 8; i++) {
    out[offset + i] = Number(x & 0xffn);
    x >>= 8n;
  }
}

export function writeI64LE(
  out: Uint8Array,
  v: bigint | number,
  offset: number
): void {
  let x = typeof v === "bigint" ? v : BigInt(v);
  if (x < -(1n << 63n) || x >= 1n << 63n)
    throw new RangeError("i64 out of range");
  if (x < 0n) x += 1n << 64n;
  writeU64LE(out, x, offset);
}

export function u64le(v: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  writeU64LE(b, v, 0);
  return b;
}
