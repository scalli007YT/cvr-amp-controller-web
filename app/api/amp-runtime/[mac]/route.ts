import { ampController } from "@/lib/amp-controller";
import { CvrAmpDevice } from "@/lib/amp-device";
import { NextResponse } from "next/server";

/**
 * GET /api/amp-runtime/[mac]
 *
 * Fetches runtime minutes for a specific amp by MAC address.
 * Looks up the IP via the AmpController's known device map,
 * then issues a unicast SN_TABLE (FC=71) query.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mac: string }> },
) {
  const { mac } = await params;

  const ip = ampController.getIpForMac(mac);
  if (!ip) {
    return NextResponse.json(
      { success: false, error: "Device not yet discovered" },
      { status: 404 },
    );
  }

  try {
    const device = new CvrAmpDevice(ip);
    const minutes = await device.queryRuntime();
    device.close();

    if (minutes === undefined) {
      return NextResponse.json(
        { success: false, error: "Could not read runtime" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, minutes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
