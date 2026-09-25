import { appendFileSync } from "node:fs";

/** Append-only JSONL log. Node-only (never import from browser code). */
export class JsonlLogger {
  constructor(private readonly path: string) {}

  log(record: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify(record) + "\n");
  }
}
