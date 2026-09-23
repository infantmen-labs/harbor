/**
 * Resumable buffer uploader: compares onchain buffer data against the local
 * .so and rewrites only differing ranges, retrying each chunk until it
 * confirms. Built for flaky RPC where stock tooling gives up.
 *
 * Env: RPC_URL, BUFFER_KEYPAIR (path), SO_PATH, CU_PRICE (micro-lamports),
 * CHUNK (bytes, default 800).
 */
import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const HEADER_LEN = 37; // Buffer state tag (4) + authority (32) + alignment

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const connection = new Connection(process.env["RPC_URL"] ?? "", "processed");
  const buffer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(process.env["BUFFER_KEYPAIR"] ?? "", "utf8"))),
  );
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(process.env["AUTHORITY_KEYPAIR"] ?? "", "utf8")),
    ),
  );
  const so = readFileSync(process.env["SO_PATH"] ?? "");
  const cuPrice = Number(process.env["CU_PRICE"] ?? 10000);
  const CHUNK = Number(process.env["CHUNK"] ?? 800);

  const total = HEADER_LEN + so.length;
  for (let attempt = 0; ; attempt++) {
    const info = await connection.getAccountInfo(buffer.publicKey, "processed");
    if (info === null) throw new Error("buffer account missing");
    const onchain = info.data;
    if (onchain.length < total) throw new Error(`buffer too small: ${onchain.length}`);

    let dirty = 0;
    let firstDirty = -1;
    for (let off = 0; off < so.length; off += CHUNK) {
      const end = Math.min(off + CHUNK, so.length);
      const want = so.subarray(off, end);
      const have = onchain.subarray(HEADER_LEN + off, HEADER_LEN + end);
      if (!want.equals(have)) {
        dirty++;
        if (firstDirty < 0) firstDirty = off;
      }
    }
    console.log(`pass ${attempt}: ${dirty} dirty ranges`);
    if (dirty === 0) {
      console.log("BUFFER_COMPLETE");
      return;
    }

    // Rewrite dirty ranges, smallest retry loop per chunk.
    for (let off = 0; off < so.length; off += CHUNK) {
      const end = Math.min(off + CHUNK, so.length);
      if (so.subarray(off, end).equals(onchain.subarray(HEADER_LEN + off, HEADER_LEN + end))) {
        continue;
      }
      const data = Buffer.alloc(8 + (end - off));
      data.writeUInt32LE(3, 0); // Write tag
      data.writeUInt32LE(off, 4);
      so.subarray(off, end).copy(data, 8);
      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }))
        .add(
          new TransactionInstruction({
            programId: BPF_LOADER,
            keys: [
              { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
              { pubkey: authority.publicKey, isWritable: false, isSigner: true },
            ],
            data,
          }),
        );
      for (let r = 0; ; r++) {
        try {
          await sendAndConfirmTransaction(connection, tx, [authority], {
            commitment: "processed",
            maxRetries: 0,
          });
          break;
        } catch (e) {
          if (r % 10 === 0) console.log(`chunk ${off} retry ${r}: ${String(e).slice(0, 100)}`);
          await sleep(Math.min(1000 * 2 ** Math.min(r, 6), 15000));
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
