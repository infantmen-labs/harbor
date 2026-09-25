"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLOT_MS_ESTIMATE = void 0;
exports.slotsToMs = slotsToMs;
exports.formatCountdown = formatCountdown;
exports.countdownToDeadline = countdownToDeadline;
/** Slot → wall-clock math. Devnet slots land roughly every 400ms. */
exports.SLOT_MS_ESTIMATE = 400;
function slotsToMs(slots) {
    return Number(slots) * exports.SLOT_MS_ESTIMATE;
}
function formatCountdown(totalSeconds) {
    if (totalSeconds <= 0)
        return "matured";
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    if (m <= 0)
        return `${s}s`;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
}
function countdownToDeadline(deadlineSlot, currentSlot) {
    if (currentSlot >= deadlineSlot)
        return "matured";
    return formatCountdown(slotsToMs(deadlineSlot - currentSlot) / 1000);
}
