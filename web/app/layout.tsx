import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  // Weight budget (DESIGN.md): display ships 500 only — logos use
  // font-medium, never bold.
  weight: ["500"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
