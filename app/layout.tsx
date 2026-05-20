import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Compliance Control",
  description: "Lightweight tax compliance tracking for recurring operational work."
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
