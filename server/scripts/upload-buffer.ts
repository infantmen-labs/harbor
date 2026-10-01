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
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const HEADER_LEN = 37; // Buffer state tag (4) + authority (32) + alignment

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let connection: Connection;
let buffer: Keypair;
let authority: Keypair;
let cuPrice = 10000;

async function sendIx(
  keys: Array<{ pubkey: PublicKey; isWritable: boolean; isSigner: boolean }>,
  data: Buffer,
  signers: Keypair[]
): Promise<string> {
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }))
    .add(new TransactionInstruction({ programId: BPF_LOADER, keys, data }));
  for (;;) {
    try {
      return await sendAndConfirmTransaction(connection, tx, signers, {
        commitment: "confirmed",
        maxRetries: 0,
      });
    } catch (e) {
      console.log(`finalize retry: ${String(e).slice(0, 120)}`);
      await sleep(3000);
    }
  }
}

async function finalize(so: Buffer): Promise<void> {
  const program = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(process.env["PROGRAM_KEYPAIR"] ?? "", "utf8"))
    )
  );
  const [programdata] = PublicKey.findProgramAddressSync(
    [program.publicKey.toBuffer()],
    BPF_LOADER
  );
  // The program account (36 bytes, loader-owned) must exist before deploy.
  {
    const existing = await connection.getAccountInfo(
      program.publicKey,
      "processed"
    );
    if (existing === null) {
      const rent = await connection.getMinimumBalanceForRentExemption(36);
      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: program.publicKey,
          lamports: rent,
          space: 36,
          programId: BPF_LOADER,
        })
      );
      await sendAndConfirmTransaction(connection, tx, [authority, program], {
        commitment: "confirmed",
      });
      console.log("created program account");
    }
  }
  // Deploy (fresh) or upgrade (existing) based on program account state.
  const progInfo = await connection.getAccountInfo(
    program.publicKey,
    "processed"
  );
  const isDeployed = progInfo !== null && progInfo.data.length > 36;
  const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
  const CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");
  let data: Buffer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let keys: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let signers: any[];
  if (!isDeployed) {
    data = Buffer.alloc(12);
    data.writeUInt32LE(2, 0); // DeployWithMaxDataLen
    data.writeBigUInt64LE(BigInt(so.length), 4);
    keys = [
      { pubkey: authority.publicKey, isWritable: true, isSigner: true },
      { pubkey: programdata, isWritable: true, isSigner: false },
      { pubkey: program.publicKey, isWritable: true, isSigner: true },
      { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
      { pubkey: RENT, isWritable: false, isSigner: false },
      { pubkey: CLOCK, isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      { pubkey: authority.publicKey, isWritable: false, isSigner: true },
    ];
    signers = [authority, program];
  } else {
    // Upgrade layout (7 accounts, no separate payer): programdata, program,
    // buffer, spill, rent, clock, authority.
    data = Buffer.alloc(4);
    data.writeUInt32LE(3, 0); // Upgrade
    keys = [
      { pubkey: programdata, isWritable: true, isSigner: false },
      { pubkey: program.publicKey, isWritable: true, isSigner: false },
      { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
      { pubkey: authority.publicKey, isWritable: true, isSigner: false },
      { pubkey: RENT, isWritable: false, isSigner: false },
      { pubkey: CLOCK, isWritable: false, isSigner: false },
      { pubkey: authority.publicKey, isWritable: false, isSigner: true },
    ];
    signers = [authority];
  }
  const sig = await sendIx(keys, data, signers);
  console.log(`DEPLOYED program=${program.publicKey.toBase58()} sig=${sig}`);
}

async function closeBuffer(): Promise<void> {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(5, 0); // Close
  const sig = await sendIx(
    [
      { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
      { pubkey: authority.publicKey, isWritable: true, isSigner: false },
      { pubkey: authority.publicKey, isWritable: false, isSigner: true },
    ],
    data,
    [authority]
  );
  console.log(`BUFFER_CLOSED sig=${sig}`);
}

async function main(): Promise<void> {
  connection = new Connection(process.env["RPC_URL"] ?? "", "processed");
  buffer = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(process.env["BUFFER_KEYPAIR"] ?? "", "utf8"))
    )
  );
  authority = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(process.env["AUTHORITY_KEYPAIR"] ?? "", "utf8"))
    )
  );
  cuPrice = Number(process.env["CU_PRICE"] ?? 10000);
  const so = readFileSync(process.env["SO_PATH"] ?? "");
  const CHUNK = Number(process.env["CHUNK"] ?? 800);

  const rpcUrl = process.env["RPC_URL"] ?? "";

  /** Sliced account read via raw RPC (keeps responses small). */
  async function readSlice(offset: number, length: number): Promise<Buffer> {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [
          buffer.publicKey.toBase58(),
          {
            commitment: "processed",
            encoding: "base64",
            dataSlice: { offset, length },
          },
        ],
      }),
    });
    const json = (await res.json()) as {
      result?: { value?: { data?: [string, string] } | null };
    };
    const data = json.result?.value?.data;
    if (data === undefined || data === null)
      throw new Error("buffer account missing");
    return Buffer.from(data[0], "base64");
  }

  const total = HEADER_LEN + so.length;

  // Create the buffer account on first run (system-owned until Assigned).
  {
    const existing = await connection.getAccountInfo(
      buffer.publicKey,
      "processed"
    );
    if (existing === null) {
      const rent = await connection.getMinimumBalanceForRentExemption(total);
      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: buffer.publicKey,
          lamports: rent,
          space: total,
          programId: BPF_LOADER,
        })
      );
      await sendAndConfirmTransaction(connection, tx, [authority, buffer], {
        commitment: "confirmed",
      });
      console.log(`created buffer ${buffer.publicKey.toBase58()} rent=${rent}`);
    }
  }

  // Initialize fresh (zeroed) buffers: InitializeBuffer sets the authority.
  {
    const head = await readSlice(0, HEADER_LEN);
    if (head.equals(Buffer.alloc(HEADER_LEN))) {
      const data = Buffer.alloc(4);
      data.writeUInt32LE(0, 0);
      const tx = new Transaction()
        .add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice })
        )
        .add(
          new TransactionInstruction({
            programId: BPF_LOADER,
            keys: [
              { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
              {
                pubkey: authority.publicKey,
                isWritable: false,
                isSigner: true,
              },
            ],
            data,
          })
        );
      await sendAndConfirmTransaction(connection, tx, [authority], {
        commitment: "confirmed",
      });
      console.log("initialized buffer");
    }
  }

  for (let attempt = 0; ; attempt++) {
    let dirty = 0;
    const dirtyRanges: Array<[number, number]> = [];
    for (let off = 0; off < so.length; off += CHUNK) {
      const end = Math.min(off + CHUNK, so.length);
      // Small sliced reads: full-account fetches trip response size limits.
      const have = await readSlice(HEADER_LEN + off, end - off);
      if (!so.subarray(off, end).equals(have)) {
        dirty++;
        dirtyRanges.push([off, end]);
      }
    }
    console.log(`pass ${attempt}: ${dirty} dirty ranges`);
    if (dirty === 0) {
      console.log("BUFFER_COMPLETE");
      if (process.env["FINALIZE"] === "1") {
        await finalize(so);
        await closeBuffer();
      }
      return;
    }

    // Rewrite dirty ranges, smallest retry loop per chunk.
    for (const [off, end] of dirtyRanges) {
      // BPFLoaderUpgradeable uses bincode: variant u32, offset u32, len u64.
      const data = Buffer.alloc(16 + (end - off));
      data.writeUInt32LE(1, 0); // Write tag
      data.writeUInt32LE(off, 4);
      data.writeBigUInt64LE(BigInt(end - off), 8);
      so.subarray(off, end).copy(data, 16);
      const tx = new Transaction()
        .add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice })
        )
        .add(
          new TransactionInstruction({
            programId: BPF_LOADER,
            keys: [
              { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
              {
                pubkey: authority.publicKey,
                isWritable: false,
                isSigner: true,
              },
            ],
            data,
          })
        );
      for (let r = 0; ; r++) {
        try {
          await sendAndConfirmTransaction(connection, tx, [authority], {
            commitment: "processed",
            maxRetries: 0,
          });
          break;
        } catch (e) {
          if (r === 0) {
            const logs =
              typeof (e as { getLogs?: () => Promise<string[]> }).getLogs ===
              "function"
                ? await (e as { getLogs: () => Promise<string[]> })
                    .getLogs()
                    .catch(() => [])
                : [];
            console.log(
              `chunk ${off} first failure: ${String(e).slice(0, 300)}`
            );
            for (const l of logs.slice(0, 12))
              console.log(`  | ${l.slice(0, 160)}`);
          }
          if (r % 10 === 0)
            console.log(`chunk ${off} retry ${r}: ${String(e).slice(0, 100)}`);
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
