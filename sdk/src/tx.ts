import {
  Connection,
  Signer,
  Transaction,
  TransactionSignature,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const EXPIRY = /block height exceeded|blockhash not found/i;

/** True only for errors proving the tx can never confirm (safe to rebuild). */
export function isExpiredError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return EXPIRY.test(msg);
}

/**
 * Send with fresh-blockhash retries. Each attempt rebuilds the tx so a
 * new blockhash is fetched; only expiry-proven failures retry (timeouts
 * and unknown states propagate — resending those could double-execute).
 * All Harbor ixs are init-or-check guarded, so a rebuilt resend after a
 * proven expiry fails safe even in the worst case.
 */
export async function sendWithRetry(
  conn: Connection,
  buildTx: () => Transaction,
  signers: Signer[],
  maxTries = 3
): Promise<TransactionSignature> {
  let lastErr: unknown = new Error("sendWithRetry: no attempts made");
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return await sendAndConfirmTransaction(conn, buildTx(), signers);
    } catch (e) {
      lastErr = e;
      if (attempt >= maxTries || !isExpiredError(e)) throw e;
    }
  }
  throw lastErr;
}
