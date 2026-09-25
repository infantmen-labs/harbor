import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countdownToDeadline, formatCountdown } from "../lib/countdown.js";

describe("countdown math (slots → seconds at ~400ms/slot)", () => {
  it("matures at and past the deadline", () => {
    assert.equal(countdownToDeadline(1000n, 1000n), "matured");
    assert.equal(countdownToDeadline(1000n, 1001n), "matured");
  });

  it("formats seconds and minutes", () => {
    assert.equal(formatCountdown(45), "45s");
    assert.equal(formatCountdown(125), "2m 05s");
    assert.equal(formatCountdown(0), "matured");
  });

  it("treats 150 slots as about a minute", () => {
    assert.equal(countdownToDeadline(1150n, 1000n), "1m 00s");
  });
});
