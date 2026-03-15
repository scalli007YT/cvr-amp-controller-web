"use client";

import { Check, Languages } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { locales, type Locale } from "@/lib/i18n/config";

interface LanguageModeToggleProps {
  lang: Locale;
  label: string;
  englishLabel: string;
  germanLabel: string;
}

export function LanguageModeToggle({ lang, label, englishLabel, germanLabel }: LanguageModeToggleProps) {
  const pathname = usePathname();
  const router = useRouter();

  const changeLocale = (nextLocale: Locale) => {
    const path = pathname || "/";
    const segments = path.split("/").filter(Boolean);

    if (segments.length > 0 && locales.includes(segments[0] as Locale)) {
      segments[0] = nextLocale;
      router.push(`/${segments.join("/")}`);
      return;
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    router.push(`/${nextLocale}${normalizedPath}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm">
          <Languages className="h-4 w-4" />
          <span className="sr-only">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => changeLocale("en")} className="gap-2">
          <Check className={`h-3.5 w-3.5 ${lang === "en" ? "opacity-100" : "opacity-0"}`} />
          {englishLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeLocale("de")} className="gap-2">
          <Check className={`h-3.5 w-3.5 ${lang === "de" ? "opacity-100" : "opacity-0"}`} />
          {germanLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
