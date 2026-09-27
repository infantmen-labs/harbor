/**
 * Harbor agent: opens a payment channel, streams metered requests with
 * cumulative vouchers, verifies merchant receipts, logs JSONL evidence,
 * and cooperatively closes via a final settle.
 *
 * Env: RPC_URL, SERVER_URL, AGENT_KEYPAIR (path), MERCHANT_PUBKEY,
 * MINT, DEPOSIT, REQUESTS, BUDGET_PER_REQUEST, SALT, LOG_PATH.
 */
import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  ATA_PROGRAM_ID,
  CHANNEL_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  buildEd25519Ix,
  channelVoucherBytes,
  receiptMessageBytes,
  signEd25519,
  verifyEd25519,
} from "harbor-sdk";
import { JsonlLogger } from "harbor-log";
import { deriveChannel, openChannelIx, settleIx, topUpIx } from "./channel";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} required`);
  return v;
}

async function postJson(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

async function main(): Promise<void> {
  const connection = new Connection(env("RPC_URL", "https://api.devnet.solana.com"), "confirmed");
  const serverUrl = env("SERVER_URL", "http://127.0.0.1:3000");
  const agent = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(env("AGENT_KEYPAIR"), "utf8"))),
  );
  const merchant = new PublicKey(env("MERCHANT_PUBKEY"));
  const channelProgram = new PublicKey(
    env("CHANNEL_PROGRAM_ID", CHANNEL_PROGRAM_ID.toBase58()),
  );
  const mint = new PublicKey(env("MINT"));
  const deposit = BigInt(env("DEPOSIT", "100000"));
  const requests = Number(env("REQUESTS", "5"));
  const budget = BigInt(env("BUDGET_PER_REQUEST", "5000"));
  const salt = BigInt(env("SALT", `${Date.now() % 1_000_000}`));
  const log = new JsonlLogger(env("LOG_PATH", "agent-run.jsonl"));
  const requestDelayMs = Number(env("REQUEST_DELAY_MS", "0"));

  // The merchant is the payee: channel escrow settles to them, and the
  // bond only binds channels that pay the bonded merchant (squat defense).
  const payee = merchant;
  const clockSlot = await connection.getSlot();
  const { channel } = deriveChannel(
    channelProgram,
    agent.publicKey,
    payee,
    mint,
    agent.publicKey,
    salt,
    BigInt(clockSlot),
  );
  const [channelAta] = (() => {
    const [a] = PublicKey.findProgramAddressSync(
      [channel.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ATA_PROGRAM_ID,
    );
    return [a] as const;
  })();
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("event_authority")],
    channelProgram,
  );
  const payerAta = (
    await connection.getParsedTokenAccountsByOwner(agent.publicKey, { mint })
  ).value[0]?.pubkey;
  if (payerAta === undefined) throw new Error("agent has no ATA for mint");

  const openTx = new Transaction().add(
    openChannelIx({
      programId: channelProgram,
      payer: agent.publicKey,
      payee,
      mint,
      authorizedSigner: agent.publicKey,
      channel,
      payerAta,
      channelAta,
      eventAuthority,
      salt,
      deposit,
      gracePeriod: 7200,
      openSlot: BigInt(clockSlot),
    }),
  );
  await sendAndConfirmTransaction(connection, openTx, [agent]);
  console.log(`channel ${channel.toBase58()}`);

  const s = await postJson(`${serverUrl}/session`, {
    channel: channel.toBase58(),
    channelProgram: channelProgram.toBase58(),
    deposit: deposit.toString(),
    authorizedSigner: agent.publicKey.toBase58(),
  });
  if (s.status !== 200) throw new Error(`session failed: ${JSON.stringify(s.json)}`);
  const binding = new PublicKey(s.json["binding"] as string);

  async function attemptRequest(
    n: bigint,
    cumulative: bigint,
  ): Promise<{ status: number; json: Record<string, unknown>; cumulative: bigint }> {
    const msg = channelVoucherBytes(channel, cumulative, 0n);
    const sig = Buffer.from(signEd25519(agent.secretKey, msg)).toString("base64");
    const r = await postJson(`${serverUrl}/complete`, {
      channel: channel.toBase58(),
      nonce: n.toString(),
      input: `agent request ${n} at ${Date.now()}`,
      voucherCumulative: cumulative.toString(),
      voucherSignature: sig,
    });
    return { status: r.status, json: r.json, cumulative };
  }

  let lastSpent = 0n;
  let lastCumulative = 0n;
  let nonce = 1n;
  let successes = 0;
  let ceiling = deposit;
  while (successes < requests) {
    if (requestDelayMs > 0) {
      await new Promise((r) => setTimeout(r, requestDelayMs));
    }
    const base = lastSpent > lastCumulative ? lastSpent : lastCumulative;
    // Authorization can never exceed the channel deposit: top up first.
    if (base + budget > ceiling) {
      const amount = deposit / 2n;
      const topTx = new Transaction().add(
        topUpIx({
          programId: channelProgram,
          payer: agent.publicKey,
          channel,
          payerAta,
          channelAta,
          mint,
          amount,
        }),
      );
      await sendAndConfirmTransaction(connection, topTx, [agent]);
      ceiling += amount;
      console.log(`topped up channel, ceiling=${ceiling}`);
    }
    let attempt = await attemptRequest(nonce, base + budget);
    if (attempt.status === 402 && typeof attempt.json["cost"] === "string") {
      // Re-authorize higher against the quoted cost and retry the same nonce.
      attempt = await attemptRequest(
        nonce,
        lastCumulative + BigInt(attempt.json["cost"] as string) * 2n,
      );
    }
    if (attempt.status !== 200) {
      log.log({ nonce: nonce.toString(), ok: false, error: attempt.json["error"], status: attempt.status });
      console.log(`request ${nonce} failed: ${JSON.stringify(attempt.json)}`);
      break;
    }
    const r = attempt;
    const receipt = r.json["receipt"] as Record<string, string>;
    const rmsg = receiptMessageBytes({
      merchant,
      binding,
      cumulativeSpend: BigInt(receipt["cumulativeSpend"]),
      meterHash: Buffer.from(receipt["meterHash"], "hex"),
      outputHash: Buffer.from(receipt["outputHash"], "hex"),
      status: 0,
      nonce,
      expirySlot: BigInt(receipt["expirySlot"]),
      signer: merchant,
    });
    const ok = verifyEd25519(merchant, rmsg, Buffer.from(receipt["signature"], "base64"));
    lastCumulative = r.cumulative;
    lastSpent = BigInt(receipt["cumulativeSpend"]);
    log.log({
      nonce: nonce.toString(),
      ok,
      tokens: r.json["tokens"],
      cost: r.json["cost"],
      voucherCumulative: r.cumulative.toString(),
      receiptSignature: receipt["signature"],
    });
    console.log(`request ${nonce}: ok=${ok} cost=${r.json["cost"]}`);
    nonce += 1n;
    successes += 1;
  }

  // Cooperative close: settle the final voucher (skip if nothing succeeded).
  if (successes === 0) {
    console.log("no successful requests; skipping settle");
    return;
  }
  const closeMsg = channelVoucherBytes(channel, lastCumulative, 0n);
  const closeSig = signEd25519(agent.secretKey, closeMsg);
  const closeTx = new Transaction().add(
    buildEd25519Ix(agent.publicKey, closeSig, closeMsg),
    settleIx(channelProgram, channel),
  );
  await sendAndConfirmTransaction(connection, closeTx, [agent]);
  console.log(`settled at ${lastCumulative}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
