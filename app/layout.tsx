import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Tax Dashboard",
  description: "Lightweight tax compliance tracking for recurring operational work.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
