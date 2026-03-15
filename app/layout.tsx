import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { LayoutContent } from "@/components/layout/layout-content";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme-provider";

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
    <>
      <html lang="en" suppressHydrationWarning className={fontSans.variable}>
        <head />
        <body
          className={`${fontSans.variable} ${fontSans.variable} h-screen overflow-hidden antialiased bg-background`}
        >
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <LayoutContent>
              <TooltipProvider>{children}</TooltipProvider>
            </LayoutContent>
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </>
  );
}
