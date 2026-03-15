import { NextRequest, NextResponse } from "next/server";
import { CvrAmpDevice } from "@/lib/amp-device";

/**
 * POST /api/amp-presets/recall
 * Body: { mac: string; ip: string; slot: number }
 *
 * Sends FC=59 recall command using Save_Recall_data { mode=2, ch_x=slot-1 }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ip, mac, slot } = body as {
      ip?: string;
      mac?: string;
      slot?: number;
    };

    if (!ip || !mac || slot === undefined) {
      return NextResponse.json({ success: false, error: "Missing ip, mac or slot" }, { status: 400 });
    }

    if (!Number.isInteger(slot) || slot < 1 || slot > 40) {
      return NextResponse.json({ success: false, error: "slot must be an integer between 1 and 40" }, { status: 400 });
    }

    const device = new CvrAmpDevice(ip);
    try {
      await device.recallPreset(slot);
    } finally {
      device.close();
    }

    return NextResponse.json({ success: true, mac, slot });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
