/**
 * GET /api/amp-channel-data?mac=XX:XX:XX:XX:XX:XX
 *
 * Request FC=27 (Synchronous_data) from a specific amp.
 * Returns channel data for that amp.
 */

import { ampController } from "@/lib/amp-controller";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mac = url.searchParams.get("mac");

  if (!mac) {
    return Response.json({ error: "Missing mac parameter" }, { status: 400 });
  }

  try {
    // Ensure controller is started
    ampController.start();

    // Request FC=27 from this amp (returns ALL channel data in multi-packet response)
    const data = await ampController.requestFC27(mac, 0);
    const hex = data.toString("hex");

    const response = {
      success: true,
      mac,
      length: data.length,
      hex
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
