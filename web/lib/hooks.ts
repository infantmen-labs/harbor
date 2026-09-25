"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PollState<T> {
  data: T | null;
  error: string | null;
  stale: boolean;
  updatedAt: number | null;
}

/** Polling fetch with error + staleness. No global store needed. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, active = true): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(async () => {
    try {
      const v = await fn();
      setData(v);
      setError(null);
      setStale(false);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
      setStale(true);
    }
  }, [fn]);

  useEffect(() => {
    if (!active) return;
    void tick();
    timer.current = setInterval(() => {
      setStale(true);
      void tick();
    }, ms);
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, [active, ms, tick]);

  return { data, error, stale, updatedAt };
}
