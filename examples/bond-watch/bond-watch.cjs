/**
 * bond-watch: third-party Harbor bond monitor.
 *
 * Uses ONLY the published @infantmen-labs/harbor-sdk + @solana/web3.js — no repo code,
 * no Anchor client, no funds. Reads a bond, its bindings, and every
 * open dispute, and prints health a treasury/risk desk would watch.
 *
 *   npm install
 *   RPC_URL=https://api.devnet.solana.com BOND=<bond-address> node bond-watch.js
 *
 * Or derive the bond from its merchant + mint instead of passing BOND:
 *   RPC_URL=... MERCHANT=<merchant> MINT=<mint> node bond-watch.js
 */
const { createHash } = require("node:crypto");
const { Connection, PublicKey } = require("@solana/web3.js");

// Minimal base58 (Bitcoin alphabet) so this example stays at two deps.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out || "1";
}
const {
  HARBOR_PROGRAM_ID,
  bondPda,
  decodeBond,
  decodeDispute,
} = require("@infantmen-labs/harbor-sdk");

function disc(name) {
  return createHash("sha256")
    .update(`account:${name}`, "utf8")
    .digest()
    .subarray(0, 8);
}

async function main() {
  const connection = new Connection(process.env["RPC_URL"] ?? "", "confirmed");
  let bond;
  if (process.env["BOND"]) {
    bond = new PublicKey(process.env["BOND"]);
  } else {
    [bond] = bondPda(
      new PublicKey(process.env["MERCHANT"] ?? ""),
      new PublicKey(process.env["MINT"] ?? "")
    );
    console.log(`derived bond ${bond.toBase58()}`);
  }

  const bondInfo = await connection.getAccountInfo(bond);
  if (bondInfo === null) throw new Error("bond not found");
  const b = decodeBond(bondInfo.data);
  const free = b.amount - b.reserved;
  console.log(`bond      ${bond.toBase58()}`);
  console.log(`merchant  ${b.merchant.toBase58()}`);
  console.log(`mint      ${b.mint.toBase58()}`);
  console.log(`bonded    ${b.amount} (reserved ${b.reserved}, free ${free})`);
  console.log(`disputes  ${b.openDisputes} open`);

  // Bindings of this bond: binding layout keeps bond at bytes 72..104.
  const bindings = await connection.getProgramAccounts(HARBOR_PROGRAM_ID, {
    filters: [
      { dataSize: 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 },
      { memcmp: { offset: 72, bytes: bond.toBase58() } },
    ],
  });
  console.log(`bindings  ${bindings.length}`);
  const bindingKeys = new Set(bindings.map((x) => x.pubkey.toBase58()));

  // Open disputes (any binding), matched to this bond locally.
  const slot = await connection.getSlot();
  const disputes = await connection.getProgramAccounts(HARBOR_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: base58(disc("Dispute")) } }],
  });
  let shown = 0;
  for (const { pubkey, account } of disputes) {
    const d = decodeDispute(account.data);
    if (!bindingKeys.has(d.binding.toBase58())) continue;
    shown += 1;
    const left = d.deadlineSlot - BigInt(slot);
    console.log(
      `dispute   ${pubkey.toBase58()} nonce=${d.nonce} claim=${d.claimSpend} ` +
        (left > 0n ? `${left} slots to deadline` : "MATURED")
    );
  }
  if (shown === 0) console.log("disputes  none open on this bond");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
