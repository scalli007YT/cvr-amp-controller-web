import { notFound } from "next/navigation";
import { LayoutContent } from "@/components/layout/layout-content";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, locales } from "@/lib/i18n/config";
import { I18nProvider } from "@/components/layout/i18n-provider";

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider dictionary={dictionary}>
        <LayoutContent lang={lang} dictionary={dictionary.header}>
          <TooltipProvider>{children}</TooltipProvider>
        </LayoutContent>
        <Toaster />
      </I18nProvider>
    </ThemeProvider>
  );
}
