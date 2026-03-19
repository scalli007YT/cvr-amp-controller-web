"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTabStore } from "@/stores/TabStore";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface AmpDevice {
  ip: string;
  name: string;
  mac: string;
  deviceVersion: string;
  identifier: string;
  runtime: string;
}

interface ScannerPageProps {
  dictionary: Dictionary["scanner"];
}

const formatCount = (text: string, count: number) => text.replace("{count}", String(count));

export function ScannerPage({ dictionary }: ScannerPageProps) {
  const setCurrentView = useTabStore((state) => state.setCurrentView);
  const [ampDevices, setAmpDevices] = useState<AmpDevice[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [subnet, setSubnet] = useState<string>("");
  const [manualIp, setManualIp] = useState<string>("");

  useEffect(() => {
    setCurrentView("scanner");
  }, [setCurrentView]);

  const handleScan = async (customSubnet?: string) => {
    setLoading(true);
    setError("");
    setAmpDevices([]);

    try {
      const scanSubnet = customSubnet || manualIp || undefined;
      const params = scanSubnet ? `?subnet=${scanSubnet}` : "";
      const res = await fetch(`/api/scan${params}`);
      const data = await res.json();

      if (data.success) {
        setSubnet(data.subnet);
        setAmpDevices(data.devices || []);
      } else {
        setError(data.error || dictionary.scanFailedFind);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : dictionary.scanFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="mb-8">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">{dictionary.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{dictionary.description}</p>
          </div>

          <div className="space-y-4">
            <Button onClick={() => handleScan()} disabled={loading} size="lg">
              {loading ? dictionary.scanning : dictionary.startScan}
            </Button>

            {subnet && (
              <div className="text-sm text-muted-foreground">
                {dictionary.scanningSubnet} <Badge>{subnet}.0/24</Badge>
              </div>
            )}

            {ampDevices.length > 0 && (
              <div className="text-sm">{formatCount(dictionary.foundDevices, ampDevices.length)}</div>
            )}

            <div className="pt-4 border-t">
              <label className="text-sm font-medium mb-2 block">{dictionary.querySpecificIp}</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="192.168.178.34"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  disabled={loading}
                />
                <Button onClick={() => handleScan(manualIp)} disabled={loading || !manualIp} variant="outline">
                  {dictionary.query}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {error && !loading && (
        <Card className="mb-8 border-destructive bg-destructive/5">
          <div className="p-6 text-sm text-destructive">{error}</div>
        </Card>
      )}

      {ampDevices.length > 0 && !loading && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{formatCount(dictionary.discoveredDevices, ampDevices.length)}</h2>
          {ampDevices.map((device) => (
            <Card key={device.ip}>
              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">{device.name}</h3>
                  <p className="text-sm text-muted-foreground">{device.ip}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground">{dictionary.mac}</p>
                    <p className="font-mono">{device.mac}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">{dictionary.version}</p>
                    <p className="font-mono text-xs">{device.deviceVersion}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">{dictionary.identifier}</p>
                    <p className="font-mono text-xs break-all">{device.identifier}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">{dictionary.runtime}</p>
                    <p className="font-semibold">{device.runtime}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {ampDevices.length === 0 && !loading && !error && (
        <Card>
          <div className="p-12 text-center text-muted-foreground">
            <p className="font-medium mb-1">{dictionary.noDevicesTitle}</p>
            <p className="text-sm">{dictionary.noDevicesDescription}</p>
          </div>
        </Card>
      )}
    </>
  );
}
