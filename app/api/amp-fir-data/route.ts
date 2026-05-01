/**
 * GET /api/amp-fir-data?mac=XX:XX:XX:XX:XX:XX&channel=0
 *
 * Request FIR filter data (FC=43, statusCode=2) for a specific output channel.
 * Returns the current FIR name and coefficients stored on the device.
 * Routed through the persistent controller socket so Dante amps are supported.
 */

import { ampController } from "@/lib/amp-controller";
import { FuncCode } from "@/lib/amp-device";
import { isSimulatedMac } from "@/lib/simulated-amps";
import { FIR_MAX_TAPS } from "@/lib/fir";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mac = url.searchParams.get("mac");
  const channelStr = url.searchParams.get("channel");

  if (!mac) {
    return Response.json({ error: "Missing mac parameter" }, { status: 400 });
  }
  if (channelStr === null) {
    return Response.json({ error: "Missing channel parameter" }, { status: 400 });
  }

  const channel = parseInt(channelStr, 10);
  if (isNaN(channel) || channel < 0 || channel > 3) {
    return Response.json({ error: "Invalid channel (0-3)" }, { status: 400 });
  }

  // Simulated amps — return default passthrough
  if (isSimulatedMac(mac)) {
    const coefficients = new Array<number>(FIR_MAX_TAPS).fill(0);
    coefficients[0] = 1;
    return Response.json({
      success: true,
      mac,
      channel,
      name: "",
      coefficients,
      simulated: true
    });
  }

  try {
    ampController.start();

    if (!ampController.getIpForMac(mac)) {
      return Response.json({ error: `Amp ${mac} not yet discovered` }, { status: 404 });
    }

    // FC=43 FIR_DATA, output channel, 2s timeout (response is ~2080 bytes / 5 fragments)
    const body = await ampController.requestFC(mac, FuncCode.FIR_DATA, channel, Buffer.alloc(0), 1, 2000);

    if (body.length < 32) {
      return Response.json({ error: "No FIR data response from device" }, { status: 504 });
    }

    // Parse FIR_DATA body: 32-byte name + 512 × float32 LE
    const nullIdx = body.indexOf(0);
    const nameEnd = Math.min(nullIdx === -1 ? 32 : nullIdx, 32);
    const name = body.slice(0, nameEnd).toString("ascii").trim();

    const floatCount = Math.min(Math.floor((body.length - 32) / 4), 512);
    const coefficients: number[] = new Array(floatCount);
    for (let i = 0; i < floatCount; i++) {
      coefficients[i] = body.readFloatLE(32 + i * 4);
    }
    while (coefficients.length < 512) {
      coefficients.push(0);
    }

    return Response.json({
      success: true,
      mac,
      channel,
      name,
      coefficients
    });
  } catch (err) {
    return Response.json(
      { error: `FIR query failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
