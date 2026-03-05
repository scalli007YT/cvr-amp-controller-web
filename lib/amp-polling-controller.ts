"use server";

import { CvrAmpDevice } from "./amp-device";
import { broadcastDiscovery } from "./arp-scan";
import type { Amp } from "@/stores/AmpStore";

/**
 * Discover and poll all amps via broadcast (matching original C# app)
 * - Uses broadcast to 255.255.255.255:45455 for discovery
 * - Queries each discovered amp with HEARTBEAT (FC=6) for real-time data
 * - Simple, fast, and robust approach
 */
export async function pollAllAmpsOnce(ampsToQuery: Amp[]): Promise<{
  succeeded: Amp[];
  failed: string[];
}> {
  const amps = ampsToQuery || [];

  if (!amps || amps.length === 0) {
    return { succeeded: [], failed: [] };
  }

  // Step 1: Discover all amps via broadcast
  let discoveredAmps: Map<string, string>; // MAC -> IP mapping
  try {
    const devices = await broadcastDiscovery();
    discoveredAmps = new Map(devices.map((d) => [d.mac, d.ip]));
  } catch (err) {
    console.error("Broadcast discovery failed:", err);
    return {
      succeeded: [],
      failed: amps.map((a) => a.mac),
    };
  }

  const succeeded: Amp[] = [];
  const failed: string[] = [];

  // Step 2: Query each assigned amp with BASIC_INFO
  for (const amp of amps) {
    try {
      // Look up IP from broadcast discovery
      const ip = discoveredAmps.get(amp.mac);

      if (!ip) {
        // Amp not found in broadcast discovery
        failed.push(amp.mac);
        continue;
      }

      // Query device with BASIC_INFO to get metadata
      const device = new CvrAmpDevice(ip);
      const info = await device.queryBasicInfo();
      device.close();

      // Return updated amp with device info
      const updatedAmp: Amp = {
        ...amp,
        name: info.name,
        version: info.deviceVersion,
        run_time: parseRuntimeMinutes(info.runtime),
        reachable: true,
      };

      succeeded.push(updatedAmp);
    } catch (error) {
      failed.push(amp.mac);
    }
  }

  return { succeeded, failed };
}

/**
 * Resolve MAC address to IP via ARP table lookup
 * ARP table should already be populated from initial broadcast ping
 */
export async function resolveAmpIp(
  mac: string,
  subnet?: string,
): Promise<string | null> {
  try {
    // Get the raw ARP output to parse (ARP table already populated)
    const { execSync } = await import("child_process");
    const isWindows = process.platform === "win32";

    let arpOutput = "";
    if (isWindows) {
      try {
        arpOutput = execSync("arp -a", { encoding: "utf-8" });
      } catch {
        return null;
      }
    } else {
      try {
        arpOutput = execSync("ip neighbor 2>/dev/null || arp -a", {
          encoding: "utf-8",
          shell: "/bin/bash",
        });
      } catch {
        return null;
      }
    }

    // Normalize the input MAC to match both colon and dash formats
    const normalizedMac = mac.toUpperCase();
    const macWithDashes = normalizedMac.replace(/:/g, "-");
    const macWithColons = normalizedMac.replace(/-/g, ":");

    // Try to extract last 3 bytes for partial matching
    const parts = normalizedMac.split(/[-:]/);
    const lastThreeBytes = parts.slice(-3).join("-").toUpperCase();
    const lastThreeBytesColons = parts.slice(-3).join(":").toUpperCase();

    const lines = arpOutput.split("\n");

    // First pass: try exact match
    for (const line of lines) {
      if (
        line.toUpperCase().includes(macWithDashes) ||
        line.toUpperCase().includes(macWithColons)
      ) {
        const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) {
          return ipMatch[1];
        }
      }
    }

    // Second pass: try partial match (last 3 bytes)
    for (const line of lines) {
      if (
        line.toUpperCase().includes(lastThreeBytes) ||
        line.toUpperCase().includes(lastThreeBytesColons)
      ) {
        const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) {
          return ipMatch[1];
        }
      }
    }
  } catch (error) {
    // Silent fail
  }

  return null;
}

/**
 * Parse runtime minutes from runtime string
 * Input comes as formatted string like "2696h-10min"
 * Return total minutes
 */
function parseRuntimeMinutes(runtime: string): number | undefined {
  try {
    // runtime comes as formatted string like "2696h-10min"
    // Parse it back to minutes
    if (!runtime || typeof runtime !== "string") return undefined;

    const match = runtime.match(/(\d+)h-(\d+)min/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const totalMinutes = hours * 60 + minutes;
      return totalMinutes;
    }
  } catch (err) {
    // Silent fail
  }

  return undefined;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
