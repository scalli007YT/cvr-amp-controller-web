"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/stores/ProjectStore";
import { useAmpStore } from "@/stores/AmpStore";
import { useTabStore } from "@/stores/TabStore";
import { AssignAmpsDialog } from "@/components/dialogs/assign-amps-dialog";
import { AmpTabs } from "@/components/monitor/amp-tabs";
import { NoProjectCard } from "@/components/monitor/no-project-card";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface MonitorPageProps {
  dictionary: Dictionary["monitor"];
}

export function MonitorPage({ dictionary }: MonitorPageProps) {
  const { selectedProject } = useProjectStore();
  const amps = useAmpStore((state) => state.amps);
  const setCurrentView = useTabStore((state) => state.setCurrentView);
  const online = amps.filter((amp) => amp.reachable).length;

  useEffect(() => {
    setCurrentView("monitor");
  }, [setCurrentView]);

  return (
    <div className="flex flex-1 flex-col space-y-4">
      {selectedProject && (
        <section className="rounded-lg border border-border/50 bg-card/30 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold sm:text-2xl">{selectedProject.name}</h1>

            <div className="flex flex-wrap items-center gap-2">
              {amps.length > 0 && (
                <span className="rounded-md border border-border/60 bg-card/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {amps.length} {dictionary.amps}
                </span>
              )}
              {amps.length > 0 && (
                <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
                  {online} {dictionary.online}
                </span>
              )}
              <AssignAmpsDialog />
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-1">{selectedProject ? <AmpTabs /> : <NoProjectCard />}</div>
    </div>
  );
}
