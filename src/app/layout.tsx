import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Styla",
  description: "AI fashion advisor built around your personal wardrobe."
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
