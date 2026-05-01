import { FuncCode } from "@/lib/amp-device";
import { ampController } from "@/lib/amp-controller";
import { getSimulatedScanDevices } from "@/lib/simulated-amps";
import { NextResponse } from "next/server";

/**
 * Parse SN_TABLE body for identifier and runtime.
 * Body offsets are relative to the stripped response (no NetworkData/StructHeader).
 */
function parseSNTableBody(body: Buffer): { identifier: string; runtime: string } {
  let identifier = "Unknown";
  let runtime = "Unknown";

  // Identifier at body[81..92] (12 bytes)
  if (body.length >= 93) {
    identifier = Array.from(body.slice(81, 93))
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join("-");
  }

  // Runtime minutes at body[74..77] (uint32 LE)
  if (body.length >= 78) {
    const totalMinutes = body.readUInt32LE(74);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    runtime = `${hours}h-${minutes}min`;
  }

  return { identifier, runtime };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectMode = url.searchParams.get("projectMode") === "demo" ? "demo" : "real";

    if (projectMode === "demo") {
      const devices = getSimulatedScanDevices();
      return NextResponse.json({
        success: devices.length > 0,
        devicesCount: devices.length,
        devices,
        error: devices.length === 0 ? "No AMP devices found" : undefined
      });
    }

    let devices;
    try {
      // Use the AmpController's already-bound socket so we don't create a
      // second UDP socket on port 45454 (which would cause EADDRINUSE).
      ampController.start();
      // Match runtime discovery behavior more closely; Dante units can reply later.
      devices = await ampController.triggerDiscovery(1200);
    } catch (err) {
      throw err;
    }

    const foundDevices = devices.map((device) => ({
      ip: device.ip,
      mac: device.mac,
      name: device.name || "Unknown",
      deviceVersion: device.version || "Unknown",
      identifier: "Unknown",
      runtime: "Unknown"
    }));

    // Enrich with SN_TABLE (FC=71) via the persistent socket — Dante-safe.
    for (const [idx, device] of devices.entries()) {
      try {
        const snBody = await ampController.requestFC(device.mac, FuncCode.SN_TABLE, 0, Buffer.alloc(0), 0, 2000);
        const { identifier, runtime } = parseSNTableBody(snBody);
        foundDevices[idx].identifier = identifier;
        foundDevices[idx].runtime = runtime;
      } catch {
        // Keep device discovered via AmpController even if enrichment fails.
      }
    }

    if (foundDevices.length === 0) {
      return NextResponse.json({ success: false, error: "No AMP devices found", devices: [] }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      devicesCount: foundDevices.length,
      devices: foundDevices
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: `Discovery failed: ${errorMsg}`, devices: [] }, { status: 500 });
  }
}
