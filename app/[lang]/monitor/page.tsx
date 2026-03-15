import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MonitorPage } from "@/components/pages/monitor-page";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/config";

export async function generateMetadata({ params }: PageProps<"/[lang]/monitor">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) {
    return {};
  }

  const dictionary = await getDictionary(lang);
  return {
    title: `${dictionary.monitor.title} | ${dictionary.header.appTitle}`
  };
}

export default async function Page({ params }: PageProps<"/[lang]/monitor">) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);
  return <MonitorPage dictionary={dictionary.monitor} />;
}
