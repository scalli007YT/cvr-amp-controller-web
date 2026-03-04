"use client";

import { useProjectStore } from "@/stores/ProjectStore";
import { useAmpStore } from "@/stores/AmpStore";
import { useAmpPoller } from "@/hooks/useAmpPoller";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Page() {
  const { selectedProject } = useProjectStore();
  const { amps } = useAmpStore();
  const { isPolling, lastUpdated, errors } = useAmpPoller();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {selectedProject
          ? `Project - ${selectedProject.name}`
          : "No Project Selected"}
      </h1>

      {selectedProject && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Assigned Amps</CardTitle>
            <div className="flex items-center gap-2">
              {isPolling && (
                <Badge variant="outline" className="animate-pulse">
                  Polling...
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {amps && amps.length > 0 ? (
              <div className="space-y-4">
                {amps.map((amp) => (
                  <div
                    key={amp.mac}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">
                        {amp.name || "Unknown Amp"}
                      </h3>
                      <Badge
                        variant={amp.reachable ? "default" : "destructive"}
                        className={
                          amp.reachable ? "bg-green-600 hover:bg-green-700" : ""
                        }
                      >
                        {amp.reachable ? "Reachable" : "Unreachable"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>
                        <span className="text-gray-500">MAC:</span>{" "}
                        <span className="font-mono">{amp.mac}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">ID:</span>{" "}
                        <span>{amp.id || "—"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Version:</span>{" "}
                        <span>{amp.version || "—"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Runtime:</span>{" "}
                        <span>
                          {amp.run_time !== undefined
                            ? `${amp.run_time} min`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No amps assigned</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
