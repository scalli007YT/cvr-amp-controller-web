import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScannerPage } from "@/components/pages/scanner-page";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/config";

export async function generateMetadata({ params }: PageProps<"/[lang]/scanner">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) {
    return {};
  }

  const dictionary = await getDictionary(lang);
  return {
    title: `${dictionary.scanner.title} | ${dictionary.header.appTitle}`
  };
}

export default async function Page({ params }: PageProps<"/[lang]/scanner">) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);
  return <ScannerPage dictionary={dictionary.scanner} />;
}
