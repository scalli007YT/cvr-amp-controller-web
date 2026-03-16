import { NextRequest, NextResponse } from "next/server";
import { CvrAmpDevice } from "@/lib/amp-device";

const PRESET_DEBUG = process.env.PRESET_DEBUG === "1";

/**
 * POST /api/amp-presets
 * Body: { mac: string; ip: string }
 *
 * Sends FC=59 mode=0 to the amp at the given IP and returns the list of
 * preset slot names parsed from the response.
 */
export async function POST(req: NextRequest) {
  try {
    const startedAt = Date.now();
    const body = await req.json();
    const { ip, mac } = body as { ip?: string; mac?: string };

    if (!ip || !mac) {
      return NextResponse.json({ success: false, error: "Missing ip or mac" }, { status: 400 });
    }

    const device = new CvrAmpDevice(ip);
    let presets: { slot: number; name: string }[] = [];
    try {
      if (PRESET_DEBUG) {
        console.info(`[amp-presets] start mac=${mac} ip=${ip}`);
      }
      presets = await device.queryPresets();
    } finally {
      device.close();
    }

    if (PRESET_DEBUG) {
      console.info(
        `[amp-presets] done mac=${mac} ip=${ip} presets=${presets.length} elapsedMs=${Date.now() - startedAt}`
      );
    }

    return NextResponse.json({ success: true, mac, presets });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (PRESET_DEBUG) {
      console.warn(`[amp-presets] failed error=${message}`);
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
