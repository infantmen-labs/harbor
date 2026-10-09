import type { Metadata } from "next";
import { CodeBlock } from "./code-block";
import { LiveEndpoint } from "./live-endpoint";

export const metadata: Metadata = {
  title: "Harbor docs — integrate the SDK",
  description:
    "Buy metered API completions with bonded refunds: gate on collateral, open a channel, verify receipts, dispute failures, reclaim the remainder.",
};

const SECTIONS = [
  { id: "endpoint", label: "Live endpoint" },
  { id: "install", label: "Install" },
  { id: "gate", label: "1 · Gate on collateral" },
  { id: "open", label: "2 · Open a channel" },
  { id: "buy", label: "3 · Buy and verify" },
  { id: "dispute", label: "4 · Dispute failures" },
  { id: "reclaim", label: "5 · Reclaim the remainder" },
  { id: "keeper", label: "Resolution" },
];

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <p className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-[28px] font-medium tracking-[-0.01em] md:text-[34px]">
        {title}
      </h2>
      <div className="mt-4 max-w-[72ch] text-[16px] leading-[160%] text-foreground-secondary">
        {children}
      </div>
    </section>
  );
}

export default function DocsHome() {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-[1280px] px-5 py-16 md:px-12"
    >
      <p className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
        Documentation
      </p>
      <h1 className="mt-4 max-w-[16ch] font-display text-[40px] font-medium leading-[1.0] tracking-[-0.02em] md:text-[56px]">
        Integrate Harbor in an afternoon.
      </h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-[150%] text-foreground-secondary">
        Node 22+ and the published SDK — no repo clone, no validator, no anchor.
        Every snippet below typechecks against
        <span className="font-mono text-[15px]">
          {" "}
          @infantmen-labs/harbor-sdk@0.7.0
        </span>{" "}
        and the read paths run live against devnet.
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[200px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1.5 text-[14px]">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-muted hover:text-foreground"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid min-w-0 gap-16">
          <Section id="endpoint" eyebrow="Try it" title="Live demo merchant">
            <LiveEndpoint />
          </Section>

          <Section id="install" eyebrow="Setup" title="Install">
            <p>
              Two packages. The buyer keypair is any funded Solana keypair — it
              pays, signs vouchers, and claims refunds.
            </p>
            <CodeBlock
              lang="sh"
              code={`npm i @infantmen-labs/harbor-sdk @solana/web3.js`}
            />
          </Section>

          <Section id="gate" eyebrow="Step 1" title="Gate on collateral">
            <p>
              Derive the merchant&apos;s bond offline, read its health, and
              refuse before opening any channel or locking any escrow when free
              collateral is below your policy. Nothing is spent, nothing is
              written.
            </p>
            <CodeBlock
              lang="ts"
              code={`import { Connection, PublicKey } from "@solana/web3.js";
import { bondPda, decodeBond } from "@infantmen-labs/harbor-sdk";

const connection = new Connection("https://api.devnet.solana.com");
const merchant = new PublicKey("GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ");
const mint = new PublicKey("HDwpthFfTBi4YyGo1zgd7zxyonE5CZsCizpVqURHGD54");

// Derived offline — no RPC call to start.
const [bond] = bondPda(merchant, mint);
const info = await connection.getAccountInfo(bond);
if (info === null) throw new Error("merchant has no bond: do not buy");
const { amount, reserved } = decodeBond(info.data);
const free = amount - reserved;
const MIN_BOND_FREE = 50_000n; // your policy, not Harbor's
if (free < MIN_BOND_FREE) throw new Error(\`bond too thin: \${free} free\`);`}
            />
          </Section>

          <Section id="open" eyebrow="Step 2" title="Open a channel">
            <p>
              Escrow a spending ceiling on the upstream program. The slot must
              be recent (channels bind their opening slot), and the payer token
              account must be funded first.
            </p>
            <CodeBlock
              lang="ts"
              code={`import {
  ataFor, channelAta, deriveChannel, openChannelIx,
  ATA_PROGRAM_ID, TOKEN_PROGRAM_ID,
} from "@infantmen-labs/harbor-sdk";

const channelProgram = new PublicKey(
  "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX" // devnet channels program
);
const salt = BigInt(Date.now() % 1_000_000);
const openSlot = BigInt(await connection.getSlot()); // must be recent
const { channel } = deriveChannel(
  channelProgram, payer, merchant, mint, payer, salt, openSlot
);
const payerAta = ataFor(payer, mint);
const [channelAta_] = channelAta(channel, TOKEN_PROGRAM_ID, mint, ATA_PROGRAM_ID);
const [eventAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("event_authority")],
  channelProgram
);
const ix = openChannelIx({
  programId: channelProgram, payer, payee: merchant, mint,
  authorizedSigner: payer, channel, payerAta,
  channelAta: channelAta_, eventAuthority, salt,
  deposit: 100_000n, gracePeriod: 7200, openSlot,
});
// Sign with the payer keypair and send. Fund payerAta first.`}
            />
          </Section>

          <Section id="buy" eyebrow="Step 3" title="Buy units, verify first">
            <p>
              Authorize unit N+1 only after unit N checks out: the voucher delta
              must cover the quote, the receipt signature must verify against
              recomputed hashes — and a valid signature is billing-ack only.
              Accept output bytes yourself.
            </p>
            <CodeBlock
              lang="ts"
              code={`import {
  assertVoucherCoversQuote, channelVoucherBytes, receiptMessageBytes,
  signEd25519, verifyEd25519,
} from "@infantmen-labs/harbor-sdk";

assertVoucherCoversQuote({ lastCumulative, voucherCumulative, quotedCost });
const voucherSig = signEd25519(
  payerSecret,
  channelVoucherBytes(channel, voucherCumulative, 0n) // 0 = no expiry
);
// POST voucher to the merchant; on HTTP 200 with output bytes:
const msg = receiptMessageBytes({
  merchant, binding, cumulativeSpend, meterHash,
  outputHash, status, nonce, expirySlot, signer,
});
const ok = verifyEd25519(signer, msg, signature);
if (!ok) throw new Error("bad receipt: stop buying");`}
            />
            <p className="mt-4">
              `meterHash` / `outputHash` are `sha256(input)` / `sha256(output)`;
              `binding` is the merchant session binding for your channel.
            </p>
          </Section>

          <Section
            id="dispute"
            eyebrow="Step 4"
            title="Dispute genuine non-delivery"
          >
            <p>
              A 500 with no receipt, after escrow lock, is disputable. Size the
              claim from chain — never from memory — and walk away when the
              suggestion is zero.
            </p>
            <CodeBlock
              lang="ts"
              code={`import {
  claimPda, disputePda, openDisputeIx, suggestClaimSpend,
} from "@infantmen-labs/harbor-sdk";

const { claimSpend, nonce } = await suggestClaimSpend(connection, {
  binding, claimant: payer, mint,
});
if (claimSpend === 0n) throw new Error("no safe claim: walk away");
const [dispute] = disputePda(binding, nonce);
const [claim] = claimPda(binding, nonce);
// openDisputeIx(programId, payer, bond, binding, channel, dispute,
//   claim, mint, claimantAta, vault, nonce, 1, claimSpend)`}
            />
          </Section>

          <Section id="reclaim" eyebrow="Step 5" title="Reclaim the remainder">
            <p>
              Settle-only close strands the unspent deposit in escrow. Walk the
              upstream lifecycle to bring it home: close, wait out the grace
              window, seal, withdraw the remainder, pay the merchant, recover
              the rent.
            </p>
            <CodeBlock
              lang="ts"
              code={`import {
  distributeIx, reclaimIx, requestCloseIx, sealIx, withdrawPayerIx,
} from "@infantmen-labs/harbor-sdk";

// requestClose (payer) → wait past grace → seal (permissionless crank)
// → withdrawPayer (remainder home) → distribute (merchant paid, escrow
// closed) → reclaim rent past open_slot + 1500. distribute needs the
// upstream treasury owner for your cluster.`}
            />
          </Section>

          <Section
            id="keeper"
            eyebrow="Resolution"
            title="Who resolves disputes"
          >
            <p>
              Any live keeper watching the program resolves matured disputes —
              past the deadline, resolution is permissionless timeout math, not
              judgment. Verify onchain: the dispute account closes and the
              claimant nets 95%. Operate your own keeper for production; never
              assume a single pass catches everything — poll loops are the
              deployment mode.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
