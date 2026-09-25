"use client";

import { useState } from "react";

/** `?mock=1` renders fixture data with no network. Labeled in the UI. */
export function useMockMode(): boolean {
  const [mock] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mock") === "1";
  });
  return mock;
}
