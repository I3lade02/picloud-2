import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PiCloud 2.0",
  description: "A self-hosted personal cloud storage dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
