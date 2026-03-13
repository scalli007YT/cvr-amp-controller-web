"use client";

import { useProjectStore } from "@/stores/ProjectStore";
import { useAmpStore } from "@/stores/AmpStore";
import { AssignAmpsDialog } from "@/components/dialogs/assign-amps-dialog";
import { AmpTabs } from "@/components/monitor/amp-tabs";

export default function MonitorPage() {
  const { selectedProject } = useProjectStore();
  const amps = useAmpStore((state) => state.amps);
  const online = amps.filter((amp) => amp.reachable).length;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border/50 bg-card/30 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold sm:text-2xl">
            {selectedProject ? selectedProject.name : "No Project Selected"}
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border/60 bg-card/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {amps.length} amps
            </span>
            <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
              {online} online
            </span>
            {selectedProject && <AssignAmpsDialog />}
          </div>
        </div>
      </section>

      <div>
        {selectedProject ? (
          <AmpTabs />
        ) : (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            Select or create a project to start monitoring amps.
          </p>
        )}
      </div>
    </div>
  );
}
