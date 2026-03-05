import { CvrAmpDevice } from "@/lib/amp-device";
import { broadcastDiscovery } from "@/lib/arp-scan";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    let devices;
    try {
      devices = await broadcastDiscovery();
    } catch (err) {
      throw err;
    }

    if (devices.length === 0) {
      return NextResponse.json(
        { success: false, error: "No AMP devices found", devices: [] },
        { status: 404 },
      );
    }

    const foundDevices: any[] = [];
    for (const device of devices) {
      try {
        const ampDevice = new CvrAmpDevice(device.ip);
        const info = await ampDevice.queryBasicInfo();
        ampDevice.close();
        foundDevices.push({
          ip: device.ip,
          mac: device.mac,
          name: info.name,
          deviceVersion: info.deviceVersion,
          identifier: info.identifier,
          runtime: info.runtime,
        });
      } catch (err) {
        // Silently continue if one device fails
      }
    }

    return NextResponse.json({
      success: true,
      devicesCount: foundDevices.length,
      devices: foundDevices,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Discovery failed: ${errorMsg}`, devices: [] },
      { status: 500 },
    );
  }
}
