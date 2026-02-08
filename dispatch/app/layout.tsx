import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chipp Issues",
  description: "AI Agent Issue Tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
