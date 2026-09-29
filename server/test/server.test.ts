import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  channelVoucherBytes,
  verifyEd25519,
  receiptMessageBytes,
} from "@infantmen-labs/harbor-sdk";
import { createApp } from "../src/index";
import { Store } from "../src/store";
import type { Config } from "../src/config";

const CHNL = new PublicKey("CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX");

describe("server sessions", () => {
  let base = "";
  let merchant: Keypair;
  let agent: Keypair;
  let channel: PublicKey;
  let store: Store;
  let server: ReturnType<typeof createApp>;
  let appCfg: Config;

  before(async () => {
    merchant = Keypair.generate();
    agent = Keypair.generate();
    channel = Keypair.generate().publicKey;
    store = new Store();
    const cfg: Config = {
      port: 0,
      rpcUrl: "",
      merchant,
      mint: Keypair.generate().publicKey,
      programId: Keypair.generate().publicKey,
      pricePerToken: 10n,
      skipChain: true,
      killToken: null,
      channelProgramAllowlist: [CHNL.toBase58()],
    };
    appCfg = cfg;
    server = createApp(cfg, store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function post(path: string, body: unknown) {
    const r = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: r.status,
      json: (await r.json()) as Record<string, unknown>,
    };
  }

  it("serves metered completions with signed receipts", async () => {
    const s = await post("/session", {
      channel: channel.toBase58(),
      channelProgram: CHNL.toBase58(),
      deposit: "100000",
      authorizedSigner: agent.publicKey.toBase58(),
    });
    assert.equal(s.status, 200);

    let cumulative = 0n;
    for (const nonce of [1n, 2n]) {
      cumulative += 5000n;
      const msg = channelVoucherBytes(channel, cumulative, 0n);
      const sig = Buffer.from(
        nacl.sign.detached(msg, agent.secretKey)
      ).toString("base64");
      const r = await post("/complete", {
        channel: channel.toBase58(),
        nonce: nonce.toString(),
        input: `hello ${nonce}`,
        voucherCumulative: cumulative.toString(),
        voucherSignature: sig,
      });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const receipt = r.json["receipt"] as Record<string, string>;
      assert.equal(receipt["nonce"], nonce.toString());
      // Receipt verifies against the merchant key.
      const rmsg = receiptMessageBytes({
        merchant: merchant.publicKey,
        binding: new PublicKey(receipt["binding"]),
        cumulativeSpend: BigInt(receipt["cumulativeSpend"]),
        meterHash: Buffer.from(receipt["meterHash"], "hex"),
        outputHash: Buffer.from(receipt["outputHash"], "hex"),
        status: 0,
        nonce,
        expirySlot: BigInt(receipt["expirySlot"]),
        signer: merchant.publicKey,
      });
      assert.ok(
        verifyEd25519(
          merchant.publicKey,
          rmsg,
          Buffer.from(receipt["signature"], "base64")
        )
      );
    }

    // Receipts are retrievable.
    const g = await fetch(`${base}/receipt/${channel.toBase58()}/1`);
    assert.equal(g.status, 200);
  });

  it("rejects sessions on non-allowlisted channel programs", async () => {
    const evil = await post("/session", {
      channel: channel.toBase58(),
      channelProgram: Keypair.generate().publicKey.toBase58(),
      deposit: "100000",
      authorizedSigner: agent.publicKey.toBase58(),
    });
    assert.equal(evil.status, 400);
    // The allowlisted (canonical) program still binds.
    const good = await post("/session", {
      channel: Keypair.generate().publicKey.toBase58(),
      channelProgram: CHNL.toBase58(),
      deposit: "100000",
      authorizedSigner: agent.publicKey.toBase58(),
    });
    assert.equal(good.status, 200);
  });

  it("rejects replays and enforces kill switch", async () => {
    const msg = channelVoucherBytes(channel, 6000n, 0n);
    const sig = Buffer.from(nacl.sign.detached(msg, agent.secretKey)).toString(
      "base64"
    );
    // Nonce 2 already used above; replay must fail.
    const replay = await post("/complete", {
      channel: channel.toBase58(),
      nonce: "2",
      input: "again",
      voucherCumulative: "6000",
      voucherSignature: sig,
    });
    assert.equal(replay.status, 400);

    await post("/admin/kill", { killed: true });
    const dead = await post("/complete", {
      channel: channel.toBase58(),
      nonce: "3",
      input: "x",
      voucherCumulative: "11000",
      voucherSignature: Buffer.from(
        nacl.sign.detached(
          channelVoucherBytes(channel, 11000n, 0n),
          agent.secretKey
        )
      ).toString("base64"),
    });
    assert.equal(dead.status, 500);
    await post("/admin/kill", { killed: false });
  });

  it("gates the kill switch behind a bearer token when set", async () => {
    const gated = createApp({ ...appCfg, killToken: "s3cret" }, new Store());
    await new Promise<void>((resolve) => gated.listen(0, resolve));
    const url = `http://127.0.0.1:${
      (gated.address() as AddressInfo).port
    }/admin/kill`;
    try {
      const anon = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ killed: true }),
      });
      assert.equal(anon.status, 401);
      const authed = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer s3cret",
        },
        body: JSON.stringify({ killed: true }),
      });
      assert.equal(
        ((await authed.json()) as Record<string, unknown>)["killed"],
        true
      );
      // Revive stays public.
      const revive = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ killed: false }),
      });
      assert.equal(
        ((await revive.json()) as Record<string, unknown>)["killed"],
        false
      );
    } finally {
      await new Promise<void>((resolve) => gated.close(() => resolve()));
    }
  });
});
