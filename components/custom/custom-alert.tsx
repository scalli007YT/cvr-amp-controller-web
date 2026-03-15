"use client";

import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangleIcon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomAlertTone = "amber" | "info";

const toneClasses: Record<CustomAlertTone, string> = {
  amber:
    "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-100",
  info: "border-blue-500/30 bg-blue-500/8 text-blue-900 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100"
};

export function CustomAlert({
  title,
  description,
  tone = "amber",
  icon,
  className
}: {
  title: string;
  description: string;
  tone?: CustomAlertTone;
  icon?: ReactNode;
  className?: string;
}) {
  const fallbackIcon = tone === "amber" ? <AlertTriangleIcon className="h-4 w-4" /> : <InfoIcon className="h-4 w-4" />;

  return (
    <Alert className={cn(toneClasses[tone], className)}>
      {icon ?? fallbackIcon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
