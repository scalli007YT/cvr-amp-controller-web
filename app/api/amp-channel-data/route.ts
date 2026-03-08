/**
 * GET /api/amp-channel-data?mac=XX:XX:XX:XX:XX:XX
 *
 * Request FC=27 (Synchronous_data) from a specific amp.
 * Returns channel data for that amp.
 * Response is cached briefly to avoid hammering the device.
 */

import { ampController } from "@/lib/amp-controller";

export const dynamic = "force-dynamic";

// Simple in-memory cache: mac -> { timestamp, data, hex }
// Cache timeout: 250ms (matches polling frequency of useAmpChannelData)
const fc27Cache = new Map<
  string,
  { timestamp: number; data: Buffer; hex: string }
>();

const CACHE_TTL_MS = 250;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mac = url.searchParams.get("mac");

  if (!mac) {
    return Response.json({ error: "Missing mac parameter" }, { status: 400 });
  }

  try {
    // Ensure controller is started
    ampController.start();

    // Check cache first
    const cached = fc27Cache.get(mac);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      const response = {
        success: true,
        mac,
        cached: true,
        length: cached.data.length,
        hex: cached.hex,
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Request FC=27 from this amp (returns ALL channel data in multi-packet response)
    const data = await ampController.requestFC27(mac, 0);
    const hex = data.toString("hex");

    // Cache the result
    fc27Cache.set(mac, {
      timestamp: Date.now(),
      data,
      hex,
    });

    const response = {
      success: true,
      mac,
      cached: false,
      length: data.length,
      hex,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
