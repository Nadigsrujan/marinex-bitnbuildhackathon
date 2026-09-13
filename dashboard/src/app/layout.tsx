import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MARINEX — Maritime Intelligence Command",
  description:
    "Autonomous Maritime Intelligence & Ocean Response — Integrated decision-support digital twin for vessel risk detection, route optimization, debris cleanup, and multi-agent orchestration.",
  keywords: [
    "maritime intelligence",
    "digital twin",
    "vessel tracking",
    "AIS anomaly detection",
    "route optimization",
    "marine debris cleanup",
    "ocean surveillance",
  ],
  authors: [{ name: "MARINEX Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
