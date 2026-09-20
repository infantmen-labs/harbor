import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { openChannelIx, settleIx, topUpIx } from "../src/channel";

const K = () => Keypair.generate().publicKey;

describe("upstream instruction layouts", () => {
  it("open carries discriminator 1 with 14 accounts", () => {
    const ix = openChannelIx({
      payer: K(),
      payee: K(),
      mint: K(),
      authorizedSigner: K(),
      channel: K(),
      payerAta: K(),
      channelAta: K(),
      eventAuthority: K(),
      salt: 42n,
      deposit: 5_000_000n,
      gracePeriod: 7200,
      openSlot: 0n,
    });
    const d = Buffer.from(ix.data);
    assert.equal(d.readUInt8(0), 1);
    assert.equal(d.readBigUInt64LE(1), 42n);
    assert.equal(d.readBigUInt64LE(9), 5_000_000n);
    assert.equal(ix.keys.length, 14);
  });

  it("settle carries discriminator 2 with channel + sysvar", () => {
    const ix = settleIx(K());
    assert.deepEqual(Array.from(ix.data), [2]);
    assert.equal(ix.keys.length, 2);
  });

  it("top_up carries discriminator 3 and amount", () => {
    const ix = topUpIx({
      payer: K(),
      channel: K(),
      payerAta: K(),
      channelAta: K(),
      mint: K(),
      amount: 9n,
    });
    const d = Buffer.from(ix.data);
    assert.equal(d.readUInt8(0), 3);
    assert.equal(d.readBigUInt64LE(1), 9n);
    assert.equal(ix.keys.length, 6);
  });
});
