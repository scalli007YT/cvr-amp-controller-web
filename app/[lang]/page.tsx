import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/i18n/config";

export default async function Page({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  redirect(`/${lang}/monitor`);
}
