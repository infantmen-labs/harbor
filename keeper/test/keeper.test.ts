import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import {
  bindingChannelProgram,
  decide,
  parseBond,
  parseDispute,
  type Dispute,
} from "../src/accounts";

const K = (n: number) => new PublicKey(Buffer.alloc(32, n));

function dispute(over: Partial<Dispute> = {}): Dispute {
  return {
    binding: K(1),
    nonce: 1n,
    reason: 1,
    claimant: K(2),
    deadlineSlot: 1000n,
    stakeLamports: 10_000_000n,
    claimSpend: 3_670n,
    ...over,
  };
}

describe("keeper adjudication", () => {
  it("matured disputes resolve as timeouts", () => {
    assert.deepEqual(decide(dispute(), 1001n), { kind: "resolve-timeout" });
  });

  it("disputes inside the window pend", () => {
    const a = decide(dispute(), 999n);
    assert.equal(a.kind, "pending");
  });
});

describe("account parsers", () => {
  it("round-trips bond layout", () => {
    const buf = Buffer.alloc(8 + 32 + 32 + 8 + 2 + 8 + 8 + 8 + 8 + 1);
    K(3).toBuffer().copy(buf, 8);
    K(4).toBuffer().copy(buf, 40);
    buf.writeBigUInt64LE(500_000n, 72);
    buf.writeUInt16LE(50, 80);
    buf.writeBigUInt64LE(150n, 82);
    buf.writeBigUInt64LE(2n, 90);
    buf.writeBigUInt64LE(7n, 98);
    buf.writeBigUInt64LE(3_000n, 106);
    const b = parseBond(buf);
    assert.ok(b.merchant.equals(K(3)));
    assert.ok(b.mint.equals(K(4)));
    assert.equal(b.amount, 500_000n);
    assert.equal(b.openDisputes, 2n);
    assert.equal(b.reserved, 3_000n);
  });

  it("round-trips dispute layout", () => {
    const buf = Buffer.alloc(8 + 32 + 8 + 1 + 32 + 8 + 8 + 8 + 1);
    K(1).toBuffer().copy(buf, 8);
    buf.writeBigUInt64LE(9n, 40);
    buf.writeUInt8(2, 48);
    K(2).toBuffer().copy(buf, 49);
    buf.writeBigUInt64LE(1000n, 81);
    buf.writeBigUInt64LE(10_000_000n, 89);
    buf.writeBigUInt64LE(3_670n, 97);
    const d = parseDispute(buf);
    assert.equal(d.nonce, 9n);
    assert.equal(d.reason, 2);
    assert.ok(d.claimant.equals(K(2)));
    assert.equal(d.deadlineSlot, 1000n);
    assert.equal(d.claimSpend, 3_670n);
  });

  it("reads the channel program from a binding", () => {
    const buf = Buffer.alloc(8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1);
    K(9).toBuffer().copy(buf, 104);
    assert.ok(bindingChannelProgram(buf).equals(K(9)));
  });
});
