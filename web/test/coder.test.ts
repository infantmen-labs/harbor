import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { BorshCoder } from "@anchor-lang/core";
import idl from "../lib/idl.json";

function disc(name: string): Buffer {
  return createHash("sha256")
    .update(`account:${name}`, "utf8")
    .digest()
    .subarray(0, 8);
}

function bondBuffer(): Buffer {
  const parts: Buffer[] = [disc("MerchantBond")];
  parts.push(Buffer.alloc(32, 3)); // merchant
  parts.push(Buffer.alloc(32, 4)); // mint
  const u64 = (v: bigint) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(v);
    return b;
  };
  parts.push(u64(500_000n));
  const sla = Buffer.alloc(2);
  sla.writeUInt16LE(50);
  parts.push(sla);
  parts.push(u64(150n));
  parts.push(u64(2n));
  parts.push(u64(7n));
  parts.push(u64(11_010n)); // reserved outflow of the open claim
  parts.push(Buffer.from([9])); // bump
  return Buffer.concat(parts);
}

describe("anchor coder field mapping", () => {
  it("decodes MerchantBond with exact field values", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coder = new BorshCoder(idl as any);
    const acc = coder.accounts.decode("MerchantBond", bondBuffer()) as Record<
      string,
      unknown
    >;
    // Coder returns BN objects; String(BN) is decimal.
    assert.equal(BigInt(String(acc["amount"])), 500_000n);
    assert.equal(Number(acc["sla_bps"]), 50);
    assert.equal(BigInt(String(acc["challenge_slots"])), 150n);
    assert.equal(BigInt(String(acc["open_disputes"])), 2n);
    assert.equal(BigInt(String(acc["last_change_slot"])), 7n);
    assert.equal(BigInt(String(acc["reserved"])), 11_010n);
    assert.equal(
      String(acc["merchant"]),
      new PublicKey(Buffer.alloc(32, 3)).toBase58()
    );
  });
});
