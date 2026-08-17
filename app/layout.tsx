import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EthioFX — Ethiopian Bank Exchange Rates",
  description: "Compare Ethiopian bank exchange rates and find the best bank for your FX transaction."
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
