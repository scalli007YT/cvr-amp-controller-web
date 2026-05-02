import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolboxPage } from "@/components/pages/toolbox-page";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/config";

export async function generateMetadata({ params }: PageProps<"/[lang]/toolbox">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) {
    return {};
  }

  const dictionary = await getDictionary(lang);
  return {
    title: `Toolbox | ${dictionary.header.appTitle}`
  };
}

export default async function Page({ params }: PageProps<"/[lang]/toolbox">) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  return <ToolboxPage />;
}
