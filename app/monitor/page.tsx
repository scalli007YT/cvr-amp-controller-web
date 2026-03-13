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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              System Monitor
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
              {selectedProject ? selectedProject.name : "No Project Selected"}
            </h1>
          </div>

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

      <div className="rounded-lg border border-border/50 bg-card/20 p-3 sm:p-4">
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
