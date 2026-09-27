/**
 * UI types — 1:1 mirror of docs/ui-contracts.md. If the backend changes
 * these shapes, update here first (import-time, never silent drift).
 */

export interface BondStatus {
  address: string;
  merchant: string;
  mint: string;
  amount: bigint;
  slaBps: number;
  challengeSlots: bigint;
  openDisputes: bigint;
  lastChangeSlot: bigint;
  reserved: bigint;
}

export interface BindingStatus {
  address: string;
  channel: string;
  merchant: string;
  bond: string;
  channelProgram: string;
  maxSpend: bigint;
  lastNonce: bigint;
  halted: boolean;
}

export type DisputeState = "open" | "matured" | "resolved-timeout";

export interface DisputeStatus {
  address: string;
  binding: string;
  nonce: bigint;
  reason: number;
  claimant: string;
  deadlineSlot: bigint;
  /** Claimant-locked claim size: max refund is exactly this. */
  claimSpend: bigint;
  state: DisputeState;
  slash?: bigint;
  winner?: string;
  signature?: string;
}

export interface Receipt {
  merchant: string;
  binding: string;
  cumulativeSpend: string;
  meterHash: string;
  outputHash: string;
  status: number;
  nonce: string;
  expirySlot: string;
  signer: string;
  signature: string;
}

export type TxState =
  | { status: "idle" }
  | { status: "pending"; signature?: string }
  | { status: "confirmed"; signature: string }
  | { status: "failed"; error: string; signature?: string };

export interface ProofEntry {
  label: string;
  value: string;
  kind: "address" | "amount" | "tx" | "text";
}
