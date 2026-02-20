import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WHERE_AGENTS_BID",
  description: "Trustless auctions for autonomous agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
