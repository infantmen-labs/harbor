"use client";

import { useEffect, useState } from "react";
import { CodeBlock } from "./code-block";

/**
 * Live demo-merchant base URL, derived from the deployment serving this
 * page — correct on every domain (production, preview, localhost) with
 * zero env plumbing. This is the merchant's public face; the tunnel
 * origin behind the proxy is intentionally never shown.
 */
export function LiveEndpoint() {
  const [origin, setOrigin] = useState("<this-site>");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const base = `${origin}/api`;
  return (
    <>
      <p>
        The demo merchant is live on devnet behind this site. Point any
        buyer at it — no repo clone, no local server:
      </p>
      <CodeBlock lang="sh" code={`SERVER_URL="${base}"`} />
      <p className="mt-4">Health check, straight at the merchant:</p>
      <CodeBlock lang="sh" code={`curl "${base}/info"`} />
    </>
  );
}
