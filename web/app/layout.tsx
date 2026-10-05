import type { Metadata } from "next";
import localFont from "next/font/local";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted latin subsets (no Google Fonts CDN dependency — offline-safe
// builds, exact weight budget). Sources: Google Fonts, SIL OFL.
const display = localFont({
  variable: "--font-display",
  src: "./fonts/space-grotesk-500.woff2",
  weight: "500",
  display: "swap",
});

const body = localFont({
  variable: "--font-body",
  src: [
    { path: "./fonts/inter-400.woff2", weight: "400" },
    { path: "./fonts/inter-500.woff2", weight: "500" },
  ],
  display: "swap",
});

const mono = localFont({
  variable: "--font-mono",
  src: [
    { path: "./fonts/jetbrains-mono-400.woff2", weight: "400" },
    { path: "./fonts/jetbrains-mono-500.woff2", weight: "500" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Harbor — Bonded refunds for agent API payments",
  description:
    "Merchants post a bond. Agents pay through payment channels. Failed deliveries refund automatically from the bond — plus a penalty to the backstop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-body">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-[8px] focus:bg-foreground focus:px-4 focus:py-2 focus:text-[14px] focus:text-background"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
