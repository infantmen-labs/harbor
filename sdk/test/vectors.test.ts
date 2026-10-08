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
  StaleVoucher,
  VoucherUnderquoted,
  assertVoucherCoversQuote,
  ataFor,
  decodeBinding,
  deriveChannel,
  distributeIx,
  isReceiptExpired,
  openChannelIx,
  reclaimIx,
  receiptExpirySlot,
  receiptMessageBytes,
  refundUnusedIx,
  requestCloseIx,
  sealIx,
  sendWithRetry,
  settleIx,
  signEd25519,
  suggestClaimSpend,
  topUpIx,
  withdrawPayerIx,
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
      mint: P(5),
      programId: P(6),
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
      // v1 domain separators (appended — v0 prefix above unchanged).
      Buffer.alloc(32, 5),
      Buffer.alloc(32, 6),
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
      mint: P(5),
      programId: P(6),
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

describe("upstream channel builders (moved from agent, byte-identical)", () => {
  const PROGRAM = P(1);
  const args = {
    programId: PROGRAM,
    payer: P(2),
    payee: P(3),
    mint: P(4),
    authorizedSigner: P(5),
    channel: P(6),
    payerAta: P(7),
    channelAta: P(8),
    eventAuthority: P(9),
    salt: 42n,
    deposit: 5_000_000n,
    gracePeriod: 7200,
    openSlot: 99n,
  };

  it("open encodes disc | salt | deposit | grace | slot | recipients", () => {
    const ix = openChannelIx(args);
    const d = Buffer.from(ix.data);
    assert.equal(d.readUInt8(0), 1);
    assert.equal(d.readBigUInt64LE(1), 42n);
    assert.equal(d.readBigUInt64LE(9), 5_000_000n);
    assert.equal(d.readUInt32LE(17), 7200);
    assert.equal(d.readBigUInt64LE(21), 99n);
    assert.equal(d.readUInt32LE(29), 0);
    assert.equal(d.length, 33);
    assert.equal(ix.keys.length, 14);
    assert.ok(ix.programId.equals(PROGRAM));
  });

  it("settle is a bare discriminator with channel + sysvar", () => {
    const ix = settleIx(PROGRAM, P(6));
    assert.deepEqual(Array.from(ix.data), [2]);
    assert.equal(ix.keys.length, 2);
  });

  it("top_up encodes disc | amount with 6 accounts", () => {
    const ix = topUpIx({
      programId: PROGRAM,
      payer: P(2),
      channel: P(6),
      payerAta: P(7),
      channelAta: P(8),
      mint: P(4),
      amount: 9n,
    });
    const d = Buffer.from(ix.data);
    assert.equal(d.readUInt8(0), 3);
    assert.equal(d.readBigUInt64LE(1), 9n);
    assert.equal(d.length, 9);
    assert.equal(ix.keys.length, 6);
  });

  it("deriveChannel matches channelPda", () => {
    const { channel } = deriveChannel(P(1), P(2), P(3), P(4), P(5), 42n, 99n);
    assert.equal(channel.toBase58().length, 44);
  });
});

describe("decodeBinding", () => {
  function bindingBytes(): Buffer {
    const b = Buffer.alloc(162);
    P(6).toBuffer().copy(b, 8);
    P(11).toBuffer().copy(b, 40);
    P(12).toBuffer().copy(b, 72);
    P(13).toBuffer().copy(b, 104);
    b.writeBigUInt64LE(2000n, 136);
    b.writeBigUInt64LE(4n, 144);
    b.writeBigUInt64LE(15000n, 152);
    b.writeUInt8(0, 160);
    return b;
  }

  it("decodes every field at its documented offset", () => {
    const d = decodeBinding(bindingBytes());
    assert.ok(d.channel.equals(P(6)));
    assert.ok(d.merchant.equals(P(11)));
    assert.ok(d.bond.equals(P(12)));
    assert.ok(d.channelProgram.equals(P(13)));
    assert.equal(d.maxSpend, 2000n);
    assert.equal(d.lastNonce, 4n);
    assert.equal(d.lastCumulativeSpend, 15000n);
    assert.equal(d.halted, false);
  });
});

describe("assertVoucherCoversQuote", () => {
  it("passes when the marginal authorization covers the quote", () => {
    assertVoucherCoversQuote({
      lastCumulative: 10000n,
      voucherCumulative: 12050n,
      quotedCost: 2000n,
    });
  });

  it("throws VoucherUnderquoted on short authorization", () => {
    assert.throws(
      () =>
        assertVoucherCoversQuote({
          lastCumulative: 10000n,
          voucherCumulative: 11000n,
          quotedCost: 2000n,
        }),
      VoucherUnderquoted
    );
  });

  it("throws StaleVoucher when behind the watermark", () => {
    assert.throws(
      () =>
        assertVoucherCoversQuote({
          lastCumulative: 10000n,
          voucherCumulative: 9000n,
          quotedCost: 1n,
        }),
      StaleVoucher
    );
  });
});

describe("suggestClaimSpend", () => {
  const BINDING = P(20);
  const CLAIMANT = P(21);
  const MINT = P(22);
  const BOND = P(23);

  function bondBytes(amount: bigint, reserved: bigint): Buffer {
    const b = Buffer.alloc(115);
    P(11).toBuffer().copy(b, 8);
    MINT.toBuffer().copy(b, 40);
    b.writeBigUInt64LE(amount, 72);
    b.writeBigUInt64LE(reserved, 106);
    return b;
  }

  function bindingBytes(maxSpend: bigint, lastNonce: bigint): Buffer {
    const b = Buffer.alloc(162);
    P(6).toBuffer().copy(b, 8);
    P(11).toBuffer().copy(b, 40);
    BOND.toBuffer().copy(b, 72);
    P(13).toBuffer().copy(b, 104);
    b.writeBigUInt64LE(maxSpend, 136);
    b.writeBigUInt64LE(lastNonce, 144);
    return b;
  }

  function mockConn(opts: {
    binding: Buffer | null;
    bondAmount: bigint;
    bondReserved: bigint;
    funded: bigint;
    ataExists: boolean;
  }) {
    const ata = ataFor(CLAIMANT, MINT);
    return {
      getAccountInfo: async (k: unknown) => {
        const key = (k as { toBase58(): string }).toBase58();
        if (key === BINDING.toBase58())
          return opts.binding === null ? null : { data: opts.binding };
        if (key === BOND.toBase58())
          return { data: bondBytes(opts.bondAmount, opts.bondReserved) };
        if (key === ata.toBase58())
          return opts.ataExists ? { data: Buffer.alloc(165) } : null;
        return null;
      },
      getTokenAccountBalance: async () => ({
        value: { amount: opts.funded.toString() },
      }),
    };
  }

  const base = {
    binding: BINDING,
    claimant: CLAIMANT,
    mint: MINT,
  };

  it("caps at binding maxSpend and defaults nonce to lastNonce + 1", async () => {
    const conn = mockConn({
      binding: bindingBytes(2000n, 4n),
      bondAmount: 500000n,
      bondReserved: 0n,
      funded: 100000n,
      ataExists: true,
    });
    const s = await suggestClaimSpend(conn as never, base);
    assert.equal(s.nonce, 5n);
    assert.equal(s.maxSpend, 2000n);
    assert.equal(s.funded, 100000n);
    assert.equal(s.claimSpend, 2000n);
  });

  it("caps at funded balance when the claimant is thin", async () => {
    const conn = mockConn({
      binding: bindingBytes(2000n, 4n),
      bondAmount: 500000n,
      bondReserved: 0n,
      funded: 500n,
      ataExists: true,
    });
    const s = await suggestClaimSpend(conn as never, base);
    assert.equal(s.claimSpend, 500n);
  });

  it("caps at bond capacity floor(free / 3)", async () => {
    const conn = mockConn({
      binding: bindingBytes(2000n, 4n),
      bondAmount: 3000n,
      bondReserved: 0n,
      funded: 100000n,
      ataExists: true,
    });
    const s = await suggestClaimSpend(conn as never, base);
    assert.equal(s.bondFree, 3000n);
    assert.equal(s.bondCap, 1000n);
    assert.equal(s.claimSpend, 1000n);
  });

  it("suggests 0 when the ATA is missing (do not open)", async () => {
    const conn = mockConn({
      binding: bindingBytes(2000n, 4n),
      bondAmount: 500000n,
      bondReserved: 0n,
      funded: 0n,
      ataExists: false,
    });
    const s = await suggestClaimSpend(conn as never, base);
    assert.equal(s.funded, 0n);
    assert.equal(s.claimSpend, 0n);
  });

  it("throws on missing binding and passes explicit nonce", async () => {
    const conn = mockConn({
      binding: null,
      bondAmount: 0n,
      bondReserved: 0n,
      funded: 0n,
      ataExists: false,
    });
    await assert.rejects(suggestClaimSpend(conn as never, base), /binding/);
    const conn2 = mockConn({
      binding: bindingBytes(2000n, 4n),
      bondAmount: 500000n,
      bondReserved: 0n,
      funded: 100000n,
      ataExists: true,
    });
    const s = await suggestClaimSpend(conn2 as never, { ...base, nonce: 9n });
    assert.equal(s.nonce, 9n);
  });
});

describe("upstream close lifecycle builders", () => {
  const PROGRAM = P(1);

  it("requestClose carries disc 5 with payer signer + channel", () => {
    const ix = requestCloseIx({
      programId: PROGRAM,
      payer: P(2),
      channel: P(6),
    });
    assert.deepEqual(Array.from(ix.data), [5]);
    assert.equal(ix.keys.length, 2);
    assert.equal(ix.keys[0]?.isSigner, true);
  });

  it("seal carries disc 6 with channel only", () => {
    const ix = sealIx({ programId: PROGRAM, channel: P(6) });
    assert.deepEqual(Array.from(ix.data), [6]);
    assert.equal(ix.keys.length, 1);
  });

  it("withdrawPayer carries disc 8 with 6 accounts", () => {
    const ix = withdrawPayerIx({
      programId: PROGRAM,
      payer: P(2),
      channel: P(6),
      channelAta: P(8),
      payerAta: P(7),
      mint: P(4),
    });
    assert.deepEqual(Array.from(ix.data), [8]);
    assert.equal(ix.keys.length, 6);
    assert.equal(ix.keys[0]?.isSigner, true);
  });

  it("reclaim carries disc 9 with channel + rentPayer", () => {
    const ix = reclaimIx({
      programId: PROGRAM,
      channel: P(6),
      rentPayer: P(2),
    });
    assert.deepEqual(Array.from(ix.data), [9]);
    assert.equal(ix.keys.length, 2);
  });
});

describe("receipt expiry readers", () => {
  const F = {
    merchant: P(1),
    binding: P(2),
    cumulativeSpend: 10_000n,
    meterHash: new Uint8Array(32).fill(3),
    outputHash: new Uint8Array(32).fill(4),
    status: 0,
    nonce: 7n,
    expirySlot: 999n,
    signer: P(1),
    mint: P(5),
    programId: P(6),
  };

  it("reads back the encoded expiry slot", () => {
    const msg = receiptMessageBytes(F);
    assert.equal(receiptExpirySlot(msg), 999n);
  });

  it("expires strictly past the slot (mirrors onchain <= gate)", () => {
    const msg = receiptMessageBytes(F);
    assert.equal(isReceiptExpired(msg, 998), false);
    assert.equal(isReceiptExpired(msg, 999), false);
    assert.equal(isReceiptExpired(msg, 1000), true);
  });
});

describe("refundUnusedIx", () => {
  it("carries the tabled discriminator with 6 accounts", () => {
    const ix = refundUnusedIx(P(0), P(1), P(2), P(3), P(4), P(5));
    assert.deepEqual(Array.from(ix.data), [239, 108, 1, 110, 2, 81, 44, 174]);
    assert.equal(ix.keys.length, 6);
    assert.equal(ix.keys[0]?.isSigner, true);
  });
});

describe("distributeIx (empty plan)", () => {
  it("encodes disc 7 + zero count with 11 fixed accounts, no signers", () => {
    const ix = distributeIx({
      programId: P(1),
      channel: P(6),
      payer: P(2),
      rentPayer: P(2),
      channelAta: P(8),
      payerAta: P(7),
      payeeAta: P(10),
      treasuryAta: P(11),
      mint: P(4),
      eventAuthority: P(9),
    });
    assert.deepEqual(Array.from(ix.data), [7, 0, 0, 0, 0]);
    assert.equal(ix.keys.length, 11);
    assert.ok(ix.keys.every((k) => k.isSigner === false));
  });
});
