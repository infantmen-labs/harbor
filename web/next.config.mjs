const SERVER_URL =
  process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://127.0.0.1:3000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Same-origin API proxy: the browser never talks cross-origin, so the
    // frozen backend needs no CORS headers.
    return [{ source: "/api/:path*", destination: `${SERVER_URL}/:path*` }];
  },
};

export default nextConfig;
