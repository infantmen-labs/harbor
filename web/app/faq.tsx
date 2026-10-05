"use client";

import { useState } from "react";

const ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "Who judges disputes?",
    a: "Nobody. Past the challenge window any payer-bound claim refunds automatically — 95% to the claimant, 5% fee plus a 2x penalty to the backstop. There is no acquittal path and no human in the loop.",
  },
  {
    q: "What if the merchant never delivers?",
    a: "Open a claim-staked dispute as the channel payer (only the payer can). A genuine failure refunds 95% of the locked claim; the bond absorbs twice the claim as penalty.",
  },
  {
    q: "Does settling erase my remedy?",
    a: "No. Settling successful units and disputing a failed nonce coexist — proven live: successes settled while nonce 2 disputed and refunded in full. Receipts attest, they never acquit.",
  },
  {
    q: "What does a receipt prove?",
    a: "That the merchant signed a statement about units served — a billing acknowledgement, not proof the output was correct. Verify output bytes yourself before paying for the next unit.",
  },
  {
    q: "Why not plain escrow?",
    a: "Escrow needs a judge or arbitrator to release. Harbor releases by timeout math: collateral locked, countdown elapsed, refund executed. No accounts, no chargebacks, no judges.",
  },
  {
    q: "Can someone drain the bond with fake claims?",
    a: "Fabrication nets −5% − fees − rent at every scale, because the refund can never exceed the locked claim. Spite-burning (destroying ≥5% of your own capital to burn 2x from a bond) is the disclosed residual.",
  },
  {
    q: "What happens past receipt expiry?",
    a: "Receipts carry an expiry slot and onchain submit rejects expired ones. The merchant sets the lifetime; buyers should check it before paying against an old receipt.",
  },
  {
    q: "What does it cost to run?",
    a: "Happy path: voucher + settle transaction fees. Disputes: 0.01 SOL stake (returned on resolve) plus fees and payer-paid account rent. See the cost model above.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-border rounded-[12px] border border-border">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                id={`faq-button-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-display text-[18px] font-medium hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              >
                {item.q}
                <span aria-hidden="true" className="font-mono text-muted">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
            </h3>
            {isOpen && (
              <p
                id={`faq-panel-${i}`}
                role="region"
                aria-labelledby={`faq-button-${i}`}
                className="px-6 pb-5 text-[15px] leading-[160%] text-foreground-secondary"
              >
                {item.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
