import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  RECEIPT_MESSAGE_LEN,
  VOUCHER_LEN,
  buildEd25519Ix,
  channelVoucherBytes,
  receiptMessageBytes,
  signEd25519,
  verifyEd25519,
} from "../src/index";

const P = (n: number) => new PublicKey(Buffer.alloc(32, n));

describe("receipt layout", () => {
  it("encodes fields in consensus order with exact length", () => {
    const f = {
      merchant: P(1),
      binding: P(2),
      cumulativeSpend: 10_000n,
      meterHash: new Uint8Array(32).fill(3),
      outputHash: new Uint8Array(32).fill(4),
      status: 0,
      nonce: 7n,
      expirySlot: 999n,
      signer: P(1),
    };
    const got = receiptMessageBytes(f);
    assert.equal(got.length, RECEIPT_MESSAGE_LEN);

    // Independently rebuild the expectation part by part.
    const exp = Buffer.concat([
      Buffer.alloc(32, 1),
      Buffer.alloc(32, 2),
      (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(10_000n); return b; })(),
      Buffer.alloc(32, 3),
      Buffer.alloc(32, 4),
      Buffer.from([0]),
      (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(7n); return b; })(),
      (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(999n); return b; })(),
      Buffer.alloc(32, 1),
    ]);
    assert.ok(got.equals(exp));
  });

  it("round-trips through tweetnacl sign/verify", () => {
    const kp = nacl.sign.keyPair();
    const msg = receiptMessageBytes({
      merchant: new PublicKey(kp.publicKey),
      binding: P(2),
      cumulativeSpend: 1n,
      meterHash: new Uint8Array(32),
      outputHash: new Uint8Array(32),
      status: 0,
      nonce: 1n,
      expirySlot: 100n,
      signer: new PublicKey(kp.publicKey),
    });
    const sig = signEd25519(kp.secretKey, msg);
    assert.ok(verifyEd25519(new PublicKey(kp.publicKey), msg, sig));
    const tampered = Buffer.from(msg);
    tampered[0] ^= 0xff;
    assert.ok(!verifyEd25519(new PublicKey(kp.publicKey), tampered, sig));
  });
});

describe("ed25519 ix layout", () => {
  it("places pubkey/sig/message at 16/48/112 with pinned indices", () => {
    const ix = buildEd25519Ix(P(9), new Uint8Array(64).fill(7), new Uint8Array([1, 2, 3]));
    const d = Buffer.from(ix.data);
    assert.equal(d.length, 16 + 32 + 64 + 3);
    assert.equal(d.readUInt8(0), 1);
    assert.equal(d.readUInt16LE(2), 48);
    assert.equal(d.readUInt16LE(6), 16);
    assert.equal(d.readUInt16LE(10), 112);
    assert.equal(d.readUInt16LE(12), 3);
    assert.ok(d.subarray(16, 48).equals(Buffer.alloc(32, 9)));
  });
});

describe("channel voucher layout", () => {
  it("is magic || channel || cumulative || expires, 50 bytes", () => {
    const v = channelVoucherBytes(P(5), 2_000_000n, 0n);
    assert.equal(v.length, VOUCHER_LEN);
    assert.equal(v.readUInt8(0), 0x56);
    assert.equal(v.readUInt8(1), 0x01);
    assert.ok(v.subarray(2, 34).equals(Buffer.alloc(32, 5)));
    assert.equal(v.readBigUInt64LE(34), 2_000_000n);
    assert.equal(v.readBigInt64LE(42), 0n);
  });
});
