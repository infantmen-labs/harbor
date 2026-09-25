import { SERVER_URL } from "./env";
import type { Receipt } from "./types";

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${SERVER_URL}${path}`);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function post<T>(path: string, body: unknown): Promise<{ status: number; json: T }> {
  const r = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as T };
}

export interface ServerInfo {
  merchant: string;
  pricePerToken: string;
  killed: boolean;
}

export function fetchInfo(): Promise<ServerInfo | null> {
  return get<ServerInfo>("/info");
}

export function fetchReceipt(channel: string, nonce: string): Promise<Receipt | null> {
  return get<Receipt>(`/receipt/${channel}/${nonce}`);
}

export function setKilled(killed: boolean): Promise<boolean> {
  return post("/admin/kill", { killed }).then(
    (r) => r.status === 200,
    () => false,
  );
}
