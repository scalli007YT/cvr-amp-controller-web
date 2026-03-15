"use client";

import { ReactNode, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { useProjectStore } from "@/stores/ProjectStore";
import { useAmpPoller } from "@/hooks/useAmpPoller";
import { useAmpChannelData } from "@/hooks/useAmpChannelData";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface LayoutContentProps {
  children: ReactNode;
  lang: Locale;
  dictionary: Dictionary["header"];
}

export function LayoutContent({ children, lang, dictionary }: LayoutContentProps) {
  const { projects, loading, setProjects, setLoading } = useProjectStore();

  // Start polling globally on layout mount — runs regardless of which page is active
  useAmpPoller();
  useAmpChannelData();

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        if (data.success) {
          setProjects(data.projects);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [setProjects, setLoading]);

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden">
      <Header lang={lang} dictionary={dictionary} projects={projects} loading={loading} />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex h-full flex-col px-3 py-3">{children}</div>
      </main>
    </div>
  );
}
