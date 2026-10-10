import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import {
  ataFor,
  bindChannelIx,
  bindingPda,
  bondPda,
  buildEd25519Ix,
  channelVoucherBytes,
  receiptMessageBytes,
  receiptPda,
  sendWithRetry,
  signEd25519,
  submitReceiptIx,
  verifyEd25519,
} from "@infantmen-labs/harbor-sdk";
import { Config, connectionFor } from "./config";
import { readUpstreamDeposit } from "./channel";
import { Session, StoredReceipt, Store, meterTokens, sha256Hex } from "./store";

const EXPIRY_SLOT = (1n << 63n) - 1n;

async function expirySlotFor(cfg: Config, conn?: Connection): Promise<bigint> {
  // Nullish (not just null): hand-built configs in tests predate the field.
  if (cfg.receiptExpirySlots == null) return EXPIRY_SLOT;
  const connection = conn ?? connectionFor(cfg);
  return BigInt(await connection.getSlot("confirmed")) + cfg.receiptExpirySlots;
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(
          raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {}
        );
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** Status-carrying handler error; the outer catch maps it (default 400). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

function httpErr(
  status: number,
  message: string,
  extra?: Record<string, unknown>
): HttpError {
  return new HttpError(status, message, extra);
}

/**
 * Client IP for faucet rate-limiting. Behind the site proxy every caller
 * shares the edge egress, so the first x-forwarded-for hop (client-set,
 * fine for limiting — never for auth) wins; direct callers fall back to
 * the socket address.
 */
export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim();
  return first !== undefined && first !== ""
    ? first
    : req.socket.remoteAddress || "unknown";
}

export function createApp(cfg: Config, store: Store, conn?: Connection) {  async function ensureBinding(session: Session): Promise<void> {
    if (cfg.skipChain) return;
    const connection = conn ?? connectionFor(cfg);
    const [binding] = bindingPda(session.channel);
    const existing = await connection.getAccountInfo(binding);
    if (existing !== null) return;
    const [bond] = bondPda(cfg.merchant.publicKey, cfg.mint);
    const buildBindTx = () =>
      new Transaction().add(
        bindChannelIx(
          cfg.programId,
          cfg.merchant.publicKey,
          bond,
          binding,
          session.channel,
          session.channelProgram,
          session.deposit
        )
      );
    await sendWithRetry(connection, buildBindTx, [cfg.merchant]);
  }

  async function submitReceiptOnchain(
    connection: Connection,
    binding: PublicKey,
    message: Uint8Array,
    signature: Uint8Array,
    args: {
      cumulativeSpend: bigint;
      meterHash: Uint8Array;
      outputHash: Uint8Array;
      status: number;
      nonce: bigint;
      expirySlot: bigint;
      signer: PublicKey;
    }
  ): Promise<void> {
    const [bond] = bondPda(cfg.merchant.publicKey, cfg.mint);
    const [receipt] = receiptPda(binding, args.nonce);
    const buildReceiptTx = () =>
      new Transaction().add(
        buildEd25519Ix(cfg.merchant.publicKey, signature, message),
        submitReceiptIx(
          cfg.programId,
          cfg.merchant.publicKey,
          bond,
          binding,
          receipt,
          args
        )
      );
    await sendWithRetry(connection, buildReceiptTx, [cfg.merchant]);
  }

  async function handleSession(body: Record<string, unknown>) {
    const channel = new PublicKey(body["channel"] as string);
    const channelProgram = new PublicKey(body["channelProgram"] as string);
    if (!cfg.channelProgramAllowlist.includes(channelProgram.toBase58())) {
      throw new Error("channel program not allowlisted");
    }
    const claimed = BigInt(body["deposit"] as string);
    const authorizedSigner = new PublicKey(body["authorizedSigner"] as string);
    if (claimed <= 0n) throw new Error("deposit must be positive");
    // Authoritative ceiling comes from the chain, never the caller: the
    // client-declared deposit is validated against escrow, so serving
    // against unbacked authorization is impossible even if the caller lies.
    let deposit = claimed;
    if (!cfg.skipChain) {
      const connection = conn ?? connectionFor(cfg);
      const info = await connection.getAccountInfo(channel);
      const onchain =
        info === null
          ? null
          : readUpstreamDeposit(
              info.data,
              info.owner,
              channelProgram,
              cfg.mint
            );
      if (onchain === null) throw new Error("channel not found or invalid");
      deposit = onchain;
    }
    const key = channel.toBase58();
    let session = store.get(key);
    if (session === undefined) {
      const [binding] = bindingPda(channel);
      session = {
        channel,
        binding,
        channelProgram,
        deposit,
        authorizedSigner,
        accepted: 0n,
        spent: 0n,
        lastNonce: 0n,
        receipts: new Map(),
      };
      store.set(session);
    }
    await ensureBinding(session);
    return { ok: true as const, binding: session.binding.toBase58() };
  }

  async function handleComplete(body: Record<string, unknown>) {
    if (store.killed) {
      return {
        status: 500 as const,
        body: { error: "delivery failed: upstream fault injected" },
      };
    }
    const channel = new PublicKey(body["channel"] as string);
    const session = store.get(channel.toBase58());
    if (session === undefined) {
      return { status: 404 as const, body: { error: "unknown session" } };
    }
    const nonce = BigInt(body["nonce"] as string);
    const input = body["input"] as string;
    const cumulative = BigInt(body["voucherCumulative"] as string);
    const sig = Buffer.from(body["voucherSignature"] as string, "base64");
    if (nonce !== session.lastNonce + 1n) {
      return {
        status: 400 as const,
        body: { error: "nonce must advance by exactly one" },
      };
    }
    if (cumulative <= session.accepted) {
      return {
        status: 402 as const,
        body: {
          error: "voucher must exceed accepted total",
          accepted: session.accepted.toString(),
        },
      };
    }
    const voucherMsg = channelVoucherBytes(channel, cumulative, 0n);
    if (!verifyEd25519(session.authorizedSigner, voucherMsg, sig)) {
      return { status: 402 as const, body: { error: "bad voucher signature" } };
    }
    // Deposit ceiling, refreshed lazily from the chain: vouchers beyond
    // escrowed funds are uncollectible on settle, so they buy no service.
    // Top-ups are learned here without any client trust.
    if (cumulative > session.deposit && !cfg.skipChain) {
      const connection = conn ?? connectionFor(cfg);
      const info = await connection.getAccountInfo(channel);
      const onchain =
        info === null
          ? null
          : readUpstreamDeposit(
              info.data,
              info.owner,
              session.channelProgram,
              cfg.mint
            );
      if (onchain === null || cumulative > onchain) {
        return {
          status: 402 as const,
          body: { error: "cumulative exceeds channel deposit" },
        };
      }
      session.deposit = onchain;
    }
    const { output, tokens } = meterTokens(input);
    const cost = tokens * cfg.pricePerToken;
    if (cumulative - session.accepted < cost) {
      return {
        status: 402 as const,
        body: { error: "authorized delta too small", cost: cost.toString() },
      };
    }
    const meterHash = Buffer.from(sha256Hex(input), "hex");
    const outputHash = Buffer.from(sha256Hex(output), "hex");
    const expirySlot = await expirySlotFor(cfg, conn);
    const msg = receiptMessageBytes({
      merchant: cfg.merchant.publicKey,
      binding: session.binding,
      cumulativeSpend: session.spent + cost,
      meterHash,
      outputHash,
      status: 0,
      nonce,
      expirySlot,
      signer: cfg.merchant.publicKey,
      mint: cfg.mint,
      programId: cfg.programId,
    });
    const signature = Buffer.from(
      signEd25519(cfg.merchant.secretKey, msg)
    ).toString("base64");
    session.accepted = cumulative;
    session.spent += cost;
    session.lastNonce = nonce;
    if (!cfg.skipChain) {
      // Best-effort onchain receipt: delivery already happened, so a
      // failed submit must never 500 the request — it only means this
      // nonce lacks an onchain record.
      await submitReceiptOnchain(
        conn ?? connectionFor(cfg),
        session.binding,
        msg,
        Buffer.from(signature, "base64"),
        {
          cumulativeSpend: session.spent,
          meterHash,
          outputHash,
          status: 0,
          nonce,
          expirySlot,
          signer: cfg.merchant.publicKey,
        }
      ).catch((e) => console.error("receipt submit failed:", e));
    }
    const receipt: StoredReceipt = {
      merchant: cfg.merchant.publicKey.toBase58(),
      binding: session.binding.toBase58(),
      cumulativeSpend: session.spent.toString(),
      meterHash: meterHash.toString("hex"),
      outputHash: outputHash.toString("hex"),
      status: 0,
      nonce: nonce.toString(),
      expirySlot: expirySlot.toString(),
      signer: cfg.merchant.publicKey.toBase58(),
      signature,
    };
    session.receipts.set(nonce.toString(), receipt);
    store.save();
    return {
      status: 200 as const,
      body: {
        output,
        tokens: tokens.toString(),
        cost: cost.toString(),
        receipt,
      },
    };
  }

  /**
   * tUSDC drip faucet. The mint is closed (no mint authority), so this
   * spends a pre-funded `cfg.faucet` balance — tops the address UP TO
   * `faucetLifetimeCap` lifetime (never a flat re-drip), gated by a
   * per-IP rolling-24h cap and a pot/SOL guard. Null faucet = 503.
   */
  async function handleFaucet(body: Record<string, unknown>, ip: string) {
    const faucet = cfg.faucet ?? null;
    if (faucet === null) throw httpErr(503, "faucet disabled");
    const drip = cfg.faucetDrip ?? 50_000000n;
    const cap = cfg.faucetLifetimeCap ?? 100_000000n;
    const ipCap = cfg.faucetIpDayCap ?? 5;
    let to: PublicKey;
    try {
      to = new PublicKey(body["address"] as string);
    } catch {
      throw httpErr(400, "invalid address");
    }
    if (to.equals(cfg.mint)) throw httpErr(400, "cannot drip to the mint");
    if (to.equals(faucet.publicKey))
      throw httpErr(400, "cannot drip to the faucet");
    const connection = conn ?? connectionFor(cfg);
    const ata = ataFor(to, cfg.mint);
    const faucetAta = ataFor(faucet.publicKey, cfg.mint);
    const existing = await connection
      .getTokenAccountBalance(ata)
      .then((b) => BigInt(b.value.amount))
      .catch(() => 0n);
    const topUp = cap > existing ? (drip < cap - existing ? drip : cap - existing) : 0n;
    if (topUp <= 0n) {
      throw httpErr(409, "address already funded", {
        ata: ata.toBase58(),
        balance: existing.toString(),
      });
    }
    const now = Date.now();
    const hits = (store.faucetHits.get(ip) ?? []).filter(
      (ts) => now - ts < 86_400_000
    );
    if (hits.length >= ipCap) throw httpErr(429, "ip daily cap reached");
    const pot = await connection
      .getTokenAccountBalance(faucetAta)
      .then((b) => BigInt(b.value.amount))
      .catch(() => 0n);
    if (pot < topUp) throw httpErr(503, "faucet empty");
    const sol = await connection.getBalance(faucet.publicKey).catch(() => 0);
    if (sol < 10_000000) throw httpErr(503, "faucet low on SOL");
    const ataInfo = await connection.getAccountInfo(ata);
    const buildTx = () => {
      const tx = new Transaction();
      if (ataInfo === null) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            faucet.publicKey,
            ata,
            to,
            cfg.mint
          )
        );
      }
      tx.add(
        createTransferInstruction(faucetAta, ata, faucet.publicKey, topUp)
      );
      return tx;
    };
    const signature = await sendWithRetry(connection, buildTx, [faucet]);
    hits.push(now);
    store.faucetHits.set(ip, hits);
    store.save();
    return {
      ok: true as const,
      ata: ata.toBase58(),
      amount: topUp.toString(),
      signature,
    };
  }

  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "POST" && url.pathname === "/session") {
        json(res, 200, await handleSession(await readBody(req)));
      } else if (req.method === "POST" && url.pathname === "/complete") {
        const r = await handleComplete(await readBody(req));
        json(res, r.status, r.body);
      } else if (req.method === "GET" && url.pathname === "/info") {
        json(res, 200, {
          merchant: cfg.merchant.publicKey.toBase58(),
          pricePerToken: cfg.pricePerToken.toString(),
          killed: store.killed,
        });
      } else if (req.method === "GET" && url.pathname.startsWith("/receipt/")) {
        const [, , channel, nonce] = url.pathname.split("/");
        const s = channel !== undefined ? store.get(channel) : undefined;
        const r = s?.receipts.get(nonce ?? "");
        if (r === undefined) json(res, 404, { error: "no receipt" });
        else json(res, 200, r);
      } else if (req.method === "POST" && url.pathname === "/faucet") {
        json(res, 200, await handleFaucet(await readBody(req), clientIp(req)));
      } else if (req.method === "POST" && url.pathname === "/admin/kill") {
        const body = await readBody(req);
        const killing = body["killed"] !== false;
        if (killing && cfg.killToken !== null) {
          const presented = (req.headers["authorization"] ?? "").replace(
            /^Bearer\s+/i,
            ""
          );
          if (presented !== cfg.killToken) {
            json(res, 401, { error: "kill switch requires a bearer token" });
            return;
          }
        }
        store.killed = killing;
        store.save();
        json(res, 200, { killed: store.killed });
      } else {
        json(res, 404, { error: "not found" });
      }
    } catch (e) {
      if (e instanceof HttpError) {
        json(res, e.status, { error: e.message, ...(e.extra ?? {}) });
        return;
      }
      json(res, 400, { error: e instanceof Error ? e.message : "bad request" });
    }
  });

  return server;
}
