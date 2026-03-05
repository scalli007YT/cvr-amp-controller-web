"use client";

import { useAmpStore } from "@/stores/AmpStore";
import { useAmpPoller } from "@/hooks/useAmpPoller";
import { useAmpControl } from "@/hooks/useAmpControl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CHANNELS = ["A", "B", "C", "D"];

function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, "0")} Hrs`;
}

export function AmpsPollongWindow() {
  const { amps, getDisplayName } = useAmpStore();
  const { isPolling } = useAmpPoller();
  const { setChannelMute, isLoading } = useAmpControl();

  return (
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
              <div key={amp.mac} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">
                    {getDisplayName(amp)}
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
                        ? formatRuntime(amp.run_time)
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Channel Controls */}
                {amp.reachable && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-semibold text-gray-600 mb-2">
                      Channel Controls
                    </p>
                    <div className="space-y-2">
                      {CHANNELS.map((channel) => (
                        <div
                          key={`${amp.mac}-${channel}`}
                          className="flex items-center gap-2"
                        >
                          <span className="text-xs font-medium w-6">
                            {channel}
                          </span>
                          <Button
                            onClick={() =>
                              setChannelMute(amp.mac, channel, false)
                            }
                            disabled={isLoading(amp.mac, channel, false)}
                            variant="outline"
                            size="sm"
                            className="text-xs flex-1"
                          >
                            {isLoading(amp.mac, channel, false)
                              ? "Unmuting..."
                              : "Unmute 🔊"}
                          </Button>
                          <Button
                            onClick={() =>
                              setChannelMute(amp.mac, channel, true)
                            }
                            disabled={isLoading(amp.mac, channel, true)}
                            variant="destructive"
                            size="sm"
                            className="text-xs flex-1"
                          >
                            {isLoading(amp.mac, channel, true)
                              ? "Muting..."
                              : "Mute 🔇"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No amps assigned</p>
        )}
      </CardContent>
    </Card>
  );
}
