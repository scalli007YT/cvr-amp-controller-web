"use server";

import { CvrAmpDevice } from "./amp-device";
import { sendArpRequest } from "./arp-scan";
import { getLocalNetworkInfo } from "./network-info";
import type { Amp } from "@/stores/AmpStore";

/**
 * Poll all amps sequentially via server action
 * - Resolves MAC to IP via ARP
 * - Fetches device info (BASIC_INFO + SN_TABLE)
 * - Returns succeeded amps with updated info and failed MACs
 */
export async function pollAllAmpsOnce(ampsToQuery: Amp[]): Promise<{
  succeeded: Amp[];
  failed: string[];
}> {
  const amps = ampsToQuery || [];
  const pollingInterval = 100; // ms between each amp

  const succeeded: Amp[] = [];
  const failed: string[] = [];

  if (!amps || amps.length === 0) {
    return { succeeded, failed };
  }

  // Get network info for ARP operations
  const networkInfo = getLocalNetworkInfo();

  // Ping broadcast once at the start to populate ARP table for all amps
  await sendArpRequest(networkInfo.subnet + ".255");

  for (let i = 0; i < amps.length; i++) {
    const amp = amps[i];

    try {
      // Step 1: Resolve MAC to IP (already populated from ARP ping)
      const ip = await resolveAmpIp(amp.mac, networkInfo.subnet);

      if (!ip) {
        throw new Error(`Could not resolve IP for MAC ${amp.mac}`);
      }

      // Step 2: Query device info
      const device = new CvrAmpDevice(ip);
      const deviceInfo = await device.queryBasicInfo();
      device.close();

      // Step 3: Parse runtime from deviceInfo
      const runtimeMinutes = parseRuntimeMinutes(deviceInfo.runtime);

      // Step 4: Return updated amp (caller will update store)
      const updatedAmp: Amp = {
        mac: amp.mac,
        name: deviceInfo.name,
        version: deviceInfo.deviceVersion,
        id: deviceInfo.identifier,
        run_time: runtimeMinutes,
        reachable: true,
      };

      succeeded.push(updatedAmp);
    } catch (error) {
      failed.push(amp.mac);
    }

    // Wait before polling next amp (except for the last one)
    if (i < amps.length - 1) {
      await sleep(pollingInterval);
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
    const match = runtime.match(/(\d+)h-(\d+)min/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      return hours * 60 + minutes;
    }
  } catch {
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
