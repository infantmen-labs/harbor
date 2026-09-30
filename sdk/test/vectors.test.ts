import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicKey, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  RECEIPT_MESSAGE_LEN,
  VOUCHER_LEN,
  buildEd25519Ix,
  channelVoucherBytes,
  decodeBond,
  decodeDispute,
  receiptMessageBytes,
  sendWithRetry,
  signEd25519,
  u64le,
  verifyEd25519,
  writeI64LE,
  writeU64LE,
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
      (() => {
        const b = Buffer.alloc(8);
        b.writeBigUInt64LE(10_000n);
        return b;
      })(),
      Buffer.alloc(32, 3),
      Buffer.alloc(32, 4),
      Buffer.from([0]),
      (() => {
        const b = Buffer.alloc(8);
        b.writeBigUInt64LE(7n);
        return b;
      })(),
      (() => {
        const b = Buffer.alloc(8);
        b.writeBigUInt64LE(999n);
        return b;
      })(),
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
    const ix = buildEd25519Ix(
      P(9),
      new Uint8Array(64).fill(7),
      new Uint8Array([1, 2, 3])
    );
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

describe("account decoders", () => {
  function layout(
    parts: Array<[number, bigint | number]>,
    size: number
  ): Buffer {
    const buf = Buffer.alloc(size);
    for (const [off, v] of parts) {
      if (typeof v === "bigint") buf.writeBigUInt64LE(v, off);
      else buf.writeUInt16LE(v, off);
    }
    return buf;
  }

  it("decodes MerchantBond with reserved", () => {
    const buf = layout(
      [
        [72, 500_000n],
        [80, 50],
        [82, 150n],
        [90, 2n],
        [98, 7n],
        [106, 11_010n],
      ],
      115
    );
    P(3).toBuffer().copy(buf, 8);
    P(4).toBuffer().copy(buf, 40);
    const b = decodeBond(buf);
    assert.ok(b.merchant.equals(P(3)));
    assert.ok(b.mint.equals(P(4)));
    assert.equal(b.amount, 500_000n);
    assert.equal(b.slaBps, 50);
    assert.equal(b.openDisputes, 2n);
    assert.equal(b.reserved, 11_010n);
  });

  it("decodes Dispute with claimSpend", () => {
    const buf = layout(
      [
        [40, 9n],
        [81, 1000n],
        [89, 10_000_000n],
        [97, 3_670n],
      ],
      106
    );
    P(1).toBuffer().copy(buf, 8);
    buf.writeUInt8(2, 48);
    P(2).toBuffer().copy(buf, 49);
    const d = decodeDispute(buf);
    assert.equal(d.nonce, 9n);
    assert.equal(d.reason, 2);
    assert.ok(d.claimant.equals(P(2)));
    assert.equal(d.claimSpend, 3_670n);
  });
});

describe("sendWithRetry", () => {
  function mockConn(script: Array<"expiry" | "fatal" | "ok">) {
    let builds = 0;
    const conn = {
      getLatestBlockhash: async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1,
      }),
      sendTransaction: async () => {
        const step = script.shift();
        if (step === "expiry") {
          throw new Error("Signature X has expired: block height exceeded.");
        }
        if (step === "fatal") throw new Error("simulated failure");
        return "sig-ok";
      },
      confirmTransaction: async () => ({ value: { err: null } }),
    };
    return {
      conn,
      builds: () => builds,
      build: () => {
        builds += 1;
        return new Transaction();
      },
    };
  }

  it("rebuilds and resends once after a single expiry", async () => {
    const { conn, builds, build } = mockConn(["expiry", "ok"]);
    const sig = await sendWithRetry(conn as never, build, [], 3);
    assert.equal(sig, "sig-ok");
    assert.equal(builds(), 2);
  });

  it("gives up after maxTries on repeated expiry", async () => {
    const { conn, builds, build } = mockConn(["expiry", "expiry", "expiry"]);
    await assert.rejects(
      sendWithRetry(conn as never, build, [], 3),
      /block height exceeded/
    );
    assert.equal(builds(), 3);
  });

  it("propagates non-expiry failures immediately without rebuild", async () => {
    const { conn, builds, build } = mockConn(["fatal", "ok"]);
    await assert.rejects(
      sendWithRetry(conn as never, build, [], 3),
      /simulated failure/
    );
    assert.equal(builds(), 1);
  });
});

describe("portable u64 encoders", () => {
  it("matches native writeBigUInt64LE byte-for-byte", () => {
    for (const v of [0n, 1n, 255n, 256n, 2n ** 32n, 2n ** 64n - 1n]) {
      const expected = Buffer.alloc(8);
      expected.writeBigUInt64LE(v);
      assert.deepEqual(u64le(v), expected);
      const out = Buffer.alloc(8);
      writeU64LE(out, v, 0);
      assert.deepEqual(out, expected);
    }
  });

  it("encodes signed i64 incl. negatives like writeBigInt64LE", () => {
    for (const v of [0n, 1n, -1n, -(2n ** 63n), 2n ** 63n - 1n]) {
      const expected = Buffer.alloc(8);
      expected.writeBigInt64LE(v);
      const out = Buffer.alloc(8);
      writeI64LE(out, v, 0);
      assert.deepEqual(out, expected);
    }
  });

  it("rejects out-of-range values instead of wrapping", () => {
    assert.throws(() => u64le(-1n), RangeError);
    assert.throws(() => u64le(2n ** 64n), RangeError);
    assert.throws(() => writeI64LE(Buffer.alloc(8), 2n ** 63n, 0), RangeError);
  });
});
