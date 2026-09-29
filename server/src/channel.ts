import { PublicKey } from "@solana/web3.js";

/**
 * Minimal reader for the pinned upstream payment-channels Channel struct
 * (solana-foundation/payment-channels@3ffa4d67, fixed 256-byte repr(C)):
 * disc(1) + version(1) + bump + status + salt(8) + deposit u64 LE @12.
 * Returns the escrowed deposit ceiling, or null when the account is not
 * a valid channel owned by the expected program.
 */
export function readUpstreamDeposit(
  data: Uint8Array,
  owner: PublicKey,
  expectedOwner: PublicKey,
  expectedMint: PublicKey
): bigint | null {
  if (!owner.equals(expectedOwner)) return null;
  if (data.length !== 256 || data[0] !== 1 || data[1] !== 1) return null;
  const mint = new PublicKey(data.slice(184, 216));
  if (!mint.equals(expectedMint)) return null;
  return (
    BigInt(data[12]!) |
    (BigInt(data[13]!) << 8n) |
    (BigInt(data[14]!) << 16n) |
    (BigInt(data[15]!) << 24n) |
    (BigInt(data[16]!) << 32n) |
    (BigInt(data[17]!) << 40n) |
    (BigInt(data[18]!) << 48n) |
    (BigInt(data[19]!) << 56n)
  );
}
