import { CvrAmpDevice } from "@/lib/amp-device";
import { ampController } from "@/lib/amp-controller";
import { NextResponse } from "next/server";

export async function GET() {
  try {
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

    if (devices.length === 0) {
      return NextResponse.json({ success: false, error: "No AMP devices found", devices: [] }, { status: 200 });
    }

    const foundDevices = devices.map((device) => ({
      ip: device.ip,
      mac: device.mac,
      name: device.name || "Unknown",
      deviceVersion: device.version || "Unknown",
      identifier: "Unknown",
      runtime: "Unknown"
    }));

    for (const [idx, device] of devices.entries()) {
      try {
        const ampDevice = new CvrAmpDevice(device.ip);
        const info = await ampDevice.queryBasicInfo();
        ampDevice.close();
        foundDevices[idx] = {
          ip: device.ip,
          mac: device.mac,
          name: info.name,
          deviceVersion: info.deviceVersion,
          identifier: info.identifier,
          runtime: info.runtime
        };
      } catch (err) {
        // Keep device discovered via AmpController even if enrichment fails.
        console.warn(
          `[scan] Enrichment failed for ${device.mac} @ ${device.ip}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
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
