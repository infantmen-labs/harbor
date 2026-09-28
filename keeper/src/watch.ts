import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  ATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  resolveTimeoutIx,
  treasuryPda,
} from "@infantmen-labs/harbor-sdk";
import { JsonlLogger } from "harbor-log";
import {
  DISPUTE_DISC,
  bindingChannelProgram,
  decide,
  decodeBond,
  decodeDispute,
} from "./accounts";
import { KeeperConfig } from "./config";

function vaultAta(bond: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [bond.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID
  )[0];
}

function ataFor(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID
  )[0];
}

/** Binding layout: disc(8) + channel(32) + merchant(32) + bond(32) + ... */
function bindingBond(bindingData: Buffer): PublicKey {
  return new PublicKey(bindingData.subarray(8 + 32 + 32, 8 + 32 + 32 + 32));
}

export async function pass(
  cfg: KeeperConfig,
  conn: Connection,
  log: JsonlLogger
): Promise<{ resolved: number; pending: number }> {
  let resolved = 0;
  let pending = 0;
  const slot = BigInt(await conn.getSlot());
  const disputes = await conn.getProgramAccounts(cfg.programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(DISPUTE_DISC) } }],
  });

  for (const { pubkey } of disputes) {
    const outcome = await consider(cfg, conn, pubkey, slot, log);
    if (outcome === "resolved") resolved++;
    else pending++;
  }
  return { resolved, pending };
}

export async function consider(
  cfg: KeeperConfig,
  conn: Connection,
  disputeKey: PublicKey,
  slot: bigint,
  log: JsonlLogger
): Promise<"resolved" | "pending"> {
  const info = await conn.getAccountInfo(disputeKey);
  if (info === null) {
    log.log({ dispute: disputeKey.toBase58(), action: "gone" });
    return "pending";
  }
  const d = decodeDispute(Buffer.from(info.data));
  const action = decide(d, slot);
  const entry = {
    dispute: disputeKey.toBase58(),
    binding: d.binding.toBase58(),
    nonce: d.nonce.toString(),
    action: action.kind,
    slot: slot.toString(),
    mode: cfg.live ? "live" : "dry-run",
  };
  if (action.kind === "pending") {
    log.log({ ...entry, why: action.why });
    return "pending";
  }
  if (!cfg.live) {
    log.log(entry);
    return "resolved";
  }

  const bindingInfo = await conn.getAccountInfo(d.binding);
  if (bindingInfo === null) throw new Error("binding not found");
  const bindingData = Buffer.from(bindingInfo.data);
  // Upstream pin: never touch bindings pointed at unknown channel programs.
  const channelProgram = bindingChannelProgram(bindingData).toBase58();
  if (!cfg.channelProgramAllowlist.includes(channelProgram)) {
    log.log({
      dispute: disputeKey.toBase58(),
      action: "skipped-untrusted-channel-program",
      channelProgram,
    });
    return "pending";
  }
  const bondKey = bindingBond(bindingData);
  const bondInfo = await conn.getAccountInfo(bondKey);
  if (bondInfo === null) throw new Error("bond not found");
  const bond = decodeBond(Buffer.from(bondInfo.data));

  const tx = new Transaction();
  const [treasury] = treasuryPda(bond.mint);
  tx.add(
    resolveTimeoutIx(
      cfg.programId,
      cfg.operator.publicKey,
      bondKey,
      bond.mint,
      d.binding,
      disputeKey,
      d.claimant,
      treasury,
      vaultAta(bondKey, bond.mint),
      ataFor(treasury, bond.mint),
      ataFor(d.claimant, bond.mint),
      d.nonce
    )
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [cfg.operator]);
  log.log({ ...entry, signature: sig });
  return "resolved";
}
