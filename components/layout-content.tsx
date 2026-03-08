"use client";

import { ReactNode, useEffect } from "react";
import { Header } from "@/components/header";
import { useProjectStore } from "@/stores/ProjectStore";
import { useAmpPoller } from "@/hooks/useAmpPoller";
import { useAmpChannelData } from "@/hooks/useAmpChannelData";

export function LayoutContent({ children }: { children: ReactNode }) {
  const { projects, loading, setProjects, setLoading, setSelectedProject } =
    useProjectStore();

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
          // Auto-select the first project
          if (data.projects.length > 0) {
            setSelectedProject(data.projects[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [setProjects, setLoading, setSelectedProject]);

  return (
    <>
      <Header projects={projects} loading={loading} />
      <main>
        <div className="container mx-auto py-8 px-4">{children}</div>
      </main>
    </>
  );
}
