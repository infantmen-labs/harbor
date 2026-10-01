import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { TxState } from "./types";

export async function sendWalletTx(
  connection: Connection,
  payer: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  instructions: TransactionInstruction[],
  onState: (s: TxState) => void
): Promise<string> {
  onState({ status: "pending" });
  try {
    const tx = new Transaction().add(...instructions);
    tx.feePayer = payer;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const signed = await signTransaction(tx);
    const raw = signed.serialize();
    const signature = await connection.sendRawTransaction(raw);
    onState({ status: "pending", signature });
    await connection.confirmTransaction(signature, "confirmed");
    onState({ status: "confirmed", signature });
    return signature;
  } catch (e) {
    const error = e instanceof Error ? e.message : "transaction failed";
    onState({ status: "failed", error });
    throw e;
  }
}
