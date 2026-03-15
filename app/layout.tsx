import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const fontSans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: "CVR AMP Controller",
  description: "Control and monitor your CVR AMP system",
  icons: {
    icon: "/logo.ico"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={fontSans.variable}>
      <head />
      <body className={`${fontSans.variable} h-screen overflow-hidden antialiased bg-background`}>{children}</body>
    </html>
  );
}
