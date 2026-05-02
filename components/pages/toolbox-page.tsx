"use client";

import { useEffect } from "react";
import { useTabStore } from "@/stores/TabStore";

export function ToolboxPage() {
  const setCurrentView = useTabStore((state) => state.setCurrentView);

  useEffect(() => {
    setCurrentView("toolbox");
  }, [setCurrentView]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="grid min-h-0 w-full flex-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Toolbox sidebar — styled like the amp rack bar */}
        <aside className="max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-card/25 p-2 xl:max-h-none">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Toolbox</h2>
          </div>
        </aside>

        {/* Empty canvas area */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/20">
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Canvas</p>
          </div>
        </div>
      </div>
    </div>
  );
}
