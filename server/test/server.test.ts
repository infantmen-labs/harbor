import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  ataFor,
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
      receiptExpirySlots: null,
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
        mint: appCfg.mint,
        programId: appCfg.programId,
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

  it("reads the upstream deposit ceiling offchain", async () => {
    const { readUpstreamDeposit } = await import("../src/channel");
    const mint = appCfg.mint;
    const mk = (deposit: bigint, owner: PublicKey, mintOk = true) => {
      const data = Buffer.alloc(256);
      data[0] = 1;
      data[1] = 1;
      data.writeBigUInt64LE(deposit, 12);
      (mintOk ? mint : Keypair.generate().publicKey).toBuffer().copy(data, 184);
      return { data, owner };
    };
    assert.equal(
      readUpstreamDeposit(mk(200_000n, CHNL, true).data, CHNL, CHNL, mint),
      200_000n
    );
    // Wrong owner, bad discriminator, short buffer, wrong mint: all null.
    const stranger = Keypair.generate().publicKey;
    assert.equal(
      readUpstreamDeposit(mk(1n, stranger, true).data, stranger, CHNL, mint),
      null
    );
    const bad = mk(1n, CHNL, true);
    bad.data[0] = 9;
    assert.equal(readUpstreamDeposit(bad.data, CHNL, CHNL, mint), null);
    assert.equal(readUpstreamDeposit(Buffer.alloc(32), CHNL, CHNL, mint), null);
    assert.equal(
      readUpstreamDeposit(mk(1n, CHNL, false).data, CHNL, CHNL, mint),
      null
    );
  });

  it("submits receipts onchain per served request", async () => {
    const chan = Keypair.generate().publicKey;
    const data = Buffer.alloc(256);
    data[0] = 1;
    data[1] = 1;
    data.writeBigUInt64LE(200_000n, 12);
    appCfg.mint.toBuffer().copy(data, 184);
    const sent: Array<{ ixs: number; programIds: string[] }> = [];
    const stubConn = {
      getAccountInfo: async (key: PublicKey) => {
        if (key.equals(chan)) {
          return { data, owner: CHNL, lamports: 1_000_000 };
        }
        return { data: Buffer.alloc(8), owner: CHNL, lamports: 1 };
      },
      getLatestBlockhash: async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1_000_000,
      }),
      sendTransaction: async (tx: {
        instructions: Array<{ programId: PublicKey }>;
      }) => {
        sent.push({
          ixs: tx.instructions.length,
          programIds: tx.instructions.map((i) => i.programId.toBase58()),
        });
        return "receiptsig";
      },
      confirmTransaction: async () => ({ value: { err: null } }),
    };
    const live = createApp(
      { ...appCfg, skipChain: false },
      new Store(),
      stubConn as never
    );
    await new Promise<void>((resolve) => live.listen(0, resolve));
    const url = `http://127.0.0.1:${(live.address() as AddressInfo).port}`;
    const lpost = async (path: string, body: unknown) => {
      const r = await fetch(`${url}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return {
        status: r.status,
        json: (await r.json()) as Record<string, unknown>,
      };
    };
    try {
      const s = await lpost("/session", {
        channel: chan.toBase58(),
        channelProgram: CHNL.toBase58(),
        deposit: "200000",
        authorizedSigner: agent.publicKey.toBase58(),
      });
      assert.equal(s.status, 200);
      const r = await lpost("/complete", {
        channel: chan.toBase58(),
        nonce: "1",
        input: "hello world meter me",
        voucherCumulative: "5000",
        voucherSignature: Buffer.from(
          nacl.sign.detached(
            channelVoucherBytes(chan, 5000n, 0n),
            agent.secretKey
          )
        ).toString("base64"),
      });
      assert.equal(r.status, 200);
      // One tx: Ed25519 precompile ix first, then the receipt submit.
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.ixs, 2);
      assert.equal(
        sent[0]!.programIds[0],
        "Ed25519SigVerify111111111111111111111111111"
      );
    } finally {
      await new Promise<void>((resolve) => live.close(() => resolve()));
    }
  });

  it("clamps sessions to onchain escrow and rejects over-authorization", async () => {
    const chan = Keypair.generate().publicKey;
    const data = Buffer.alloc(256);
    data[0] = 1;
    data[1] = 1;
    data.writeBigUInt64LE(200_000n, 12);
    appCfg.mint.toBuffer().copy(data, 184);
    const stubConn = {
      getAccountInfo: async (key: PublicKey) => {
        if (key.equals(chan)) {
          return { data, owner: CHNL, lamports: 1_000_000 };
        }
        // Pretend the binding already exists so no bind tx is attempted.
        return { data: Buffer.alloc(8), owner: CHNL, lamports: 1 };
      },
      getLatestBlockhash: async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1_000_000,
      }),
      sendTransaction: async () => "stubsig",
      confirmTransaction: async () => ({ value: { err: null } }),
    };
    const live = createApp(
      { ...appCfg, skipChain: false },
      new Store(),
      stubConn as never
    );
    await new Promise<void>((resolve) => live.listen(0, resolve));
    const url = `http://127.0.0.1:${(live.address() as AddressInfo).port}`;
    const lpost = async (path: string, body: unknown) => {
      const r = await fetch(`${url}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return {
        status: r.status,
        json: (await r.json()) as Record<string, unknown>,
      };
    };
    try {
      // Inflated client claim (999M) is clamped to the onchain 200k.
      const s = await lpost("/session", {
        channel: chan.toBase58(),
        channelProgram: CHNL.toBase58(),
        deposit: "999999999",
        authorizedSigner: agent.publicKey.toBase58(),
      });
      assert.equal(s.status, 200);
      const over = await lpost("/complete", {
        channel: chan.toBase58(),
        nonce: "1",
        input: "x",
        voucherCumulative: "300000",
        voucherSignature: Buffer.from(
          nacl.sign.detached(
            channelVoucherBytes(chan, 300000n, 0n),
            agent.secretKey
          )
        ).toString("base64"),
      });
      assert.equal(over.status, 402);
      // Within ceiling flows normally.
      const ok = await lpost("/complete", {
        channel: chan.toBase58(),
        nonce: "1",
        input: "hello world meter me",
        voucherCumulative: "5000",
        voucherSignature: Buffer.from(
          nacl.sign.detached(
            channelVoucherBytes(chan, 5000n, 0n),
            agent.secretKey
          )
        ).toString("base64"),
      });
      assert.equal(ok.status, 200);
      // After an onchain top-up the refreshed ceiling admits larger
      // authorizations without any client change.
      data.writeBigUInt64LE(300_000n, 12);
      const topped = await lpost("/complete", {
        channel: chan.toBase58(),
        nonce: "2",
        input: "after top up",
        voucherCumulative: "250000",
        voucherSignature: Buffer.from(
          nacl.sign.detached(
            channelVoucherBytes(chan, 250000n, 0n),
            agent.secretKey
          )
        ).toString("base64"),
      });
      assert.equal(topped.status, 200);
    } finally {
      await new Promise<void>((resolve) => live.close(() => resolve()));
    }
  });

  it("round-trips sessions and kill state through a snapshot file", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "harbor-store-"));
    try {
      const path = join(dir, "store.json");
      const s = new Store(path);
      s.set({
        channel,
        binding: Keypair.generate().publicKey,
        channelProgram: CHNL,
        deposit: 200_000n,
        authorizedSigner: agent.publicKey,
        accepted: 5_000n,
        spent: 1_000n,
        lastNonce: 1n,
        receipts: new Map([
          [
            "1",
            {
              merchant: merchant.publicKey.toBase58(),
              binding: "b",
              cumulativeSpend: "1000",
              meterHash: "00",
              outputHash: "11",
              status: 0,
              nonce: "1",
              expirySlot: "9",
              signer: merchant.publicKey.toBase58(),
              signature: "sig",
            },
          ],
        ]),
      });
      s.killed = true;
      s.save();
      const back = Store.load(path);
      assert.ok(back !== null);
      assert.equal(back!.killed, true);
      const got = back!.get(channel.toBase58());
      assert.ok(got !== undefined);
      assert.equal(got!.deposit, 200_000n);
      assert.equal(got!.accepted, 5_000n);
      assert.equal(got!.receipts.get("1")!.cumulativeSpend, "1000");
      assert.equal(Store.load(join(dir, "missing.json")), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


describe("faucet", () => {
  const DRIP = 50_000000n;
  const CAP = 100_000000n;
  let base = "";
  let mint: PublicKey;
  let faucet: Keypair;
  let store: Store;
  let server: ReturnType<typeof createApp>;
  let baseCfg: Config;
  const stub = {
    balances: {} as Record<string, bigint>,
    pot: [] as Array<{ ata: string; amount: bigint }>,
    sol: 1_000_000_000,
    sent: [] as string[],
  };
  const FAKE_SIG = "fakesig111111111111111111111111111111111111111";

  async function post(
    baseUrl: string,
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ) {
    const r = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return {
      status: r.status,
      json: (await r.json()) as Record<string, unknown>,
    };
  }

  before(async () => {
    mint = Keypair.generate().publicKey;
    faucet = Keypair.generate();
    store = new Store();
    const conn = {
      getTokenAccountBalance: async (pk: PublicKey) => {
        const a = stub.balances[pk.toBase58()];
        if (a === undefined) throw new Error("could not find account");
        return {
          value: { amount: a.toString(), decimals: 6, uiAmount: Number(a) / 1e6 },
        };
      },
      getParsedTokenAccountsByOwner: async () => ({
        value: stub.pot.map((p) => ({
          pubkey: new PublicKey(p.ata),
          account: {
            data: {
              parsed: { info: { tokenAmount: { amount: p.amount.toString() } } },
            },
          },
        })),
      }),
      getAccountInfo: async () => null,
      getBalance: async () => stub.sol,
      getLatestBlockhash: async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1,
      }),
      sendTransaction: async () => {
        stub.sent.push("tx");
        return FAKE_SIG;
      },
      confirmTransaction: async () => ({
        context: { slot: 1 },
        value: { err: null },
      }),
    } as unknown as Connection;
    baseCfg = {
      port: 0,
      rpcUrl: "",
      merchant: Keypair.generate(),
      mint,
      programId: Keypair.generate().publicKey,
      pricePerToken: 10n,
      skipChain: true,
      killToken: null,
      receiptExpirySlots: null,
      channelProgramAllowlist: [CHNL.toBase58()],
      faucet,
      faucetDrip: DRIP,
      faucetLifetimeCap: CAP,
      faucetIpDayCap: 2,
    };
    server = createApp(baseCfg, store, conn);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    stub.balances = {};
    stub.pot = [{ ata: Keypair.generate().publicKey.toBase58(), amount: 1_000_000000n }];
    stub.sol = 1_000_000_000;
    stub.sent.length = 0;
    store.faucetHits.clear();
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("503s when no faucet key is configured", async () => {
    const s2 = createApp({ ...baseCfg, faucet: null }, new Store());
    await new Promise<void>((resolve) => s2.listen(0, resolve));
    try {
      const b2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
      const r = await post(b2, "/faucet", {
        address: Keypair.generate().publicKey.toBase58(),
      });
      assert.equal(r.status, 503);
    } finally {
      await new Promise<void>((resolve) => s2.close(() => resolve()));
    }
  });

  it("refuses invalid and reserved addresses", async () => {
    assert.equal((await post(base, "/faucet", { address: "nope" })).status, 400);
    assert.equal(
      (await post(base, "/faucet", { address: mint.toBase58() })).status,
      400
    );
    assert.equal(
      (await post(base, "/faucet", { address: faucet.publicKey.toBase58() }))
        .status,
      400
    );
  });

  it("409s when the address is already at the lifetime cap", async () => {
    const to = Keypair.generate().publicKey;
    stub.balances[ataFor(to, mint).toBase58()] = CAP;
    const r = await post(base, "/faucet", { address: to.toBase58() });
    assert.equal(r.status, 409);
    assert.equal(r.json["balance"], CAP.toString());
    assert.ok(typeof r.json["ata"] === "string");
  });

  it("429s past the per-IP daily cap but honors x-forwarded-for", async () => {
    const now = Date.now();
    store.faucetHits.set("::ffff:127.0.0.1", [now, now - 1000]);
    const capped = await post(base, "/faucet", {
      address: Keypair.generate().publicKey.toBase58(),
    });
    assert.equal(capped.status, 429);
    const other = await post(
      base,
      "/faucet",
      { address: Keypair.generate().publicKey.toBase58() },
      { "x-forwarded-for": "9.9.9.9" }
    );
    assert.equal(other.status, 200);
  });

  it("drips the full amount to an empty address and records the hit", async () => {
    const to = Keypair.generate().publicKey;
    const r = await post(base, "/faucet", { address: to.toBase58() });
    assert.equal(r.status, 200);
    assert.equal(r.json["amount"], DRIP.toString());
    assert.equal(r.json["signature"], FAKE_SIG);
    assert.equal(r.json["ata"], ataFor(to, mint).toBase58());
    assert.equal(stub.sent.length, 1);
    assert.equal(store.faucetHits.get("::ffff:127.0.0.1")?.length, 1);
  });

  it("tops up only to the lifetime cap", async () => {
    const to = Keypair.generate().publicKey;
    stub.balances[ataFor(to, mint).toBase58()] = 60_000000n;
    const r = await post(base, "/faucet", { address: to.toBase58() });
    assert.equal(r.status, 200);
    assert.equal(r.json["amount"], (CAP - 60_000000n).toString());
  });

  it("503s when no funded faucet account exists", async () => {
    stub.pot = [];
    const r = await post(base, "/faucet", {
      address: Keypair.generate().publicKey.toBase58(),
    });
    assert.equal(r.status, 503);
  });

  it("503s when the richest account cannot cover the top-up", async () => {
    stub.pot = [{ ata: Keypair.generate().publicKey.toBase58(), amount: 10_000000n }];
    const r = await post(base, "/faucet", {
      address: Keypair.generate().publicKey.toBase58(),
    });
    assert.equal(r.status, 503);
  });

  it("sources from the richest account when several exist", async () => {
    stub.pot = [
      { ata: Keypair.generate().publicKey.toBase58(), amount: 10_000000n },
      { ata: Keypair.generate().publicKey.toBase58(), amount: 700_000000n },
    ];
    const to = Keypair.generate().publicKey;
    const r = await post(base, "/faucet", { address: to.toBase58() });
    assert.equal(r.status, 200);
    assert.equal(r.json["amount"], DRIP.toString());
  });

  it("503s when the faucet is low on SOL", async () => {
    stub.sol = 0;
    const r = await post(base, "/faucet", {
      address: Keypair.generate().publicKey.toBase58(),
    });
    assert.equal(r.status, 503);
  });
});
