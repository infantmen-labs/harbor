/** Slot → wall-clock math. Devnet slots land roughly every 400ms. */
export const SLOT_MS_ESTIMATE = 400;

export function slotsToMs(slots: bigint): number {
  return Number(slots) * SLOT_MS_ESTIMATE;
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "matured";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function countdownToDeadline(
  deadlineSlot: bigint,
  currentSlot: bigint
): string {
  if (currentSlot >= deadlineSlot) return "matured";
  return formatCountdown(slotsToMs(deadlineSlot - currentSlot) / 1000);
}
