import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import AppShell from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTG Knowledge - ナレッジ蓄積・検索ツール",
  description: "MTG音声データからナレッジを蓄積し、質問に回答するツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
