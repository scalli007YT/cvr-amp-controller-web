import { CvrAmpDevice } from "@/lib/amp-device";
import { resolveAmpIp } from "@/lib/amp-polling-controller";

interface MuteRequest {
  macAddress: string;
  channel: string;
  muted: boolean;
}

interface ControlResponse {
  success: boolean;
  message: string;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body: MuteRequest = await request.json();
    const { macAddress, channel, muted } = body;

    if (!macAddress || !channel) {
      return Response.json(
        {
          success: false,
          message: "Missing macAddress or channel",
        },
        { status: 400 },
      );
    }

    // Resolve MAC address to IP
    const ampIp = await resolveAmpIp(macAddress);
    if (!ampIp) {
      return Response.json(
        {
          success: false,
          message: `Could not resolve IP for MAC ${macAddress}`,
        },
        { status: 404 },
      );
    }

    // Create device and send mute command
    const device = new CvrAmpDevice(ampIp);
    try {
      await device.setMute(channel, muted);
      return Response.json(
        {
          success: true,
          message: `Channel ${channel} ${muted ? "muted" : "unmuted"} successfully`,
        },
        { status: 200 },
      );
    } finally {
      device.close();
    }
  } catch (error) {
    console.error("Amp control error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return Response.json(
      {
        success: false,
        message: `Control failed: ${message}`,
      },
      { status: 500 },
    );
  }
}
