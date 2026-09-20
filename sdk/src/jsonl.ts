import { appendFileSync } from "node:fs";

export class JsonlLogger {
  constructor(private readonly path: string) {}

  log(record: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify(record) + "\n");
  }
}
