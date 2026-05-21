import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaveTab | Minimalist Tab Manager",
  description: "A beautiful and minimalist site to save and organize your browser tabs into folders.",
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
