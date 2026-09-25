"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const countdown_js_1 = require("../lib/countdown.js");
(0, node_test_1.describe)("countdown math (slots → seconds at ~400ms/slot)", () => {
    (0, node_test_1.it)("matures at and past the deadline", () => {
        strict_1.default.equal((0, countdown_js_1.countdownToDeadline)(1000n, 1000n), "matured");
        strict_1.default.equal((0, countdown_js_1.countdownToDeadline)(1000n, 1001n), "matured");
    });
    (0, node_test_1.it)("formats seconds and minutes", () => {
        strict_1.default.equal((0, countdown_js_1.formatCountdown)(45), "45s");
        strict_1.default.equal((0, countdown_js_1.formatCountdown)(125), "2m 05s");
        strict_1.default.equal((0, countdown_js_1.formatCountdown)(0), "matured");
    });
    (0, node_test_1.it)("treats 150 slots as about a minute", () => {
        strict_1.default.equal((0, countdown_js_1.countdownToDeadline)(1150n, 1000n), "1m 00s");
    });
});
