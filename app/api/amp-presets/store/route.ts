import { NextRequest, NextResponse } from "next/server";
import { CvrAmpDevice } from "@/lib/amp-device";
import { presetStoreRequestSchema } from "@/lib/validation/presets";

/**
 * POST /api/amp-presets/store
 * Body: { mac: string; ip: string; slot: number; name: string }
 *
 * Sends FC=59 store command using Save_Recall_data { mode=1, ch_x=slot-1, buffers=name[32] }.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = presetStoreRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request body"
        },
        { status: 400 }
      );
    }

    const { ip, mac, slot, name } = parsed.data;

    const device = new CvrAmpDevice(ip);
    try {
      await device.storePreset(slot, name);
    } finally {
      device.close();
    }

    return NextResponse.json({ success: true, mac, slot, name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
