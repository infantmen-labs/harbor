import { CHANNEL_PROGRAM_ID as SDK_CHANNEL_PROGRAM_ID } from "harbor-sdk";

export const PROGRAM_ID =
  process.env["NEXT_PUBLIC_PROGRAM_ID"] ??
  "BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H";
export const CHANNEL_PROGRAM_ID =
  process.env["NEXT_PUBLIC_CHANNEL_PROGRAM_ID"] ??
  SDK_CHANNEL_PROGRAM_ID.toBase58();
export const RPC_URL =
  process.env["NEXT_PUBLIC_RPC_URL"] ?? "https://api.devnet.solana.com";
export const SERVER_URL =
  process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://127.0.0.1:3000";
