import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sotto · Italian, in every song",
  description: "Learn Italian through music. Follow the lyrics, discover words, and make them yours.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
