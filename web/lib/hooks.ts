"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PollState<T> {
  data: T | null;
  error: string | null;
  stale: boolean;
  updatedAt: number | null;
  backoffMs: number;
}

const BASE_JITTER = 0.15;
const MAX_BACKOFF_MS = 60_000;

/**
 * Polling fetch with error + staleness. Consecutive failures back off
 * exponentially (with jitter) so a struggling endpoint is not hammered;
 * any success resets the delay. No global store needed.
 */
export function usePoll<T>(
  fn: () => Promise<T>,
  ms: number,
  active = true
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [backoffMs, setBackoffMs] = useState(ms);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);

  const tick = useCallback(async () => {
    try {
      const v = await fn();
      setData(v);
      setError(null);
      setStale(false);
      setUpdatedAt(Date.now());
      failures.current = 0;
      setBackoffMs(ms);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
      setStale(true);
      failures.current += 1;
      const next = Math.min(ms * 2 ** failures.current, MAX_BACKOFF_MS);
      setBackoffMs(next);
    }
  }, [fn, ms]);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const loop = () => {
      if (stop) return;
      setStale(true);
      void tick().finally(() => {
        if (stop) return;
        const jitter = 1 + (Math.random() * 2 - 1) * BASE_JITTER;
        const fails = failures.current;
        const delay = Math.min(ms * 2 ** fails, MAX_BACKOFF_MS) * jitter;
        timer.current = setTimeout(loop, delay);
      });
    };
    void tick();
    timer.current = setTimeout(loop, ms);
    return () => {
      stop = true;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [active, ms, tick]);

  return { data, error, stale, updatedAt, backoffMs };
}
