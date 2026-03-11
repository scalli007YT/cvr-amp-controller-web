/**
 * POST /api/amp-actions
 *
 * Sends a control command to a specific amp via CvrAmpDevice.sendControl,
 * which uses an ephemeral UDP socket with the correct write-command wire format
 * confirmed by real packet captures AND the original C# source code.
 *
 * Wire format for ALL write commands:
 *   NetworkData flag: 0x0000d903
 *   statusCode:       1
 *
 * StructHeader layout (from C# Struct_test.structHeader, Pack=1, Sequential):
 *   [0]   Head         = 0x55
 *   [1]   Function_code
 *   [2]   Status_code  = 1 (write)
 *   [3]   chx          = channel index (0-3)
 *   [4]   Segment      = 0
 *   [5-8] Link         = 0 (int32 LE)
 *   [9]   in_out_flag  = 0 (input) | 1 (Output)  ← C# enum in_out_flag
 *
 * Request body (JSON):
 * {
 *   mac:    string,           // target amp MAC e.g. "6A:20:67:18:B5:8A"
 *   action: AmpAction,        // see type below
 *   channel: 0 | 1 | 2 | 3,  // channel index (A=0 B=1 C=2 D=3)
 *   value:  boolean | number  // action-specific payload
 * }
 *
 * Supported actions:
 *
 *   "muteIn"  — FC=10 MUTE, in_out_flag=0 (input)
 *   "muteOut" — FC=10 MUTE, in_out_flag=1 (Output)
 *   "invertPolarityOut" — FC=18 INVERTED, in_out_flag=1 (Output)
 *   "noiseGateOut" — FC=69 NOISE_GATE, in_out_flag=1 (Output)
 *     value: true=mute, false=unmute
 *     Wire body: 0x00=muted, 0x01=unmuted  (confirmed from C# source)
 *     C# source: Channels.cs    → SendStruct(MUTE, ch, in_out_flag.input,  link, mute_data)
 *                Channels_out.cs → SendStruct(MUTE, ch, in_out_flag.Output, link, mute_data)
 */

import { ampController } from "@/lib/amp-controller";
import { CvrAmpDevice, FuncCode } from "@/lib/amp-device";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AmpAction = "muteIn" | "muteOut" | "invertPolarityOut" | "noiseGateOut";

interface AmpActionRequest {
  mac: string;
  action: AmpAction;
  channel: 0 | 1 | 2 | 3;
  /** true/false for mute actions */
  value: boolean;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  let body: AmpActionRequest;

  try {
    body = (await request.json()) as AmpActionRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mac, action, channel, value } = body;

  if (!mac || !action || channel === undefined || value === undefined) {
    return Response.json(
      { error: "Missing required fields: mac, action, channel, value" },
      { status: 400 },
    );
  }

  if (channel < 0 || channel > 3) {
    return Response.json({ error: "channel must be 0–3" }, { status: 400 });
  }

  // Ensure controller is started
  ampController.start();

  const ip = ampController.getIpForMac(mac);
  if (!ip) {
    return Response.json(
      { error: `Amp ${mac} not yet discovered — is it online?` },
      { status: 404 },
    );
  }

  const device = new CvrAmpDevice(ip);

  try {
    switch (action) {
      // -----------------------------------------------------------------------
      // Mute input — FC=10, in_out_flag=0 (input)
      // C# source: SendStruct(MUTE, ch, in_out_flag.input, linkNum, mute_data)
      // Wire body: 0x00=muted, 0x01=unmuted
      // -----------------------------------------------------------------------
      case "muteIn": {
        const payload = Buffer.from([value ? 0x00 : 0x01]);
        await device.sendControl(
          FuncCode.MUTE,
          channel,
          payload,
          0 /* input */,
        );
        break;
      }

      // -----------------------------------------------------------------------
      // Mute output — FC=10, in_out_flag=1 (Output)
      // C# source: SendStruct(MUTE, ch, in_out_flag.Output, linkNum, mute_data)
      // Wire body: 0x00=muted, 0x01=unmuted
      // -----------------------------------------------------------------------
      case "muteOut": {
        const payload = Buffer.from([value ? 0x00 : 0x01]);
        await device.sendControl(
          FuncCode.MUTE,
          channel,
          payload,
          1 /* Output */,
        );
        break;
      }

      // -----------------------------------------------------------------------
      // Output polarity invert — FC=18, in_out_flag=1 (Output)
      // Wire body: 0x00 = normal polarity, 0x01 = inverted polarity
      // Readback parser confirms non-zero means polarity flipped.
      // -----------------------------------------------------------------------
      case "invertPolarityOut": {
        const payload = Buffer.from([value ? 0x01 : 0x00]);
        await device.sendControl(
          FuncCode.PHASE,
          channel,
          payload,
          1 /* Output */,
        );
        break;
      }

      // -----------------------------------------------------------------------
      // Noise gate output — FC=69, in_out_flag=1 (Output)
      // Wire body follows the same convention observed in sync data:
      //   0x00 = enabled/on
      //   0x01 = disabled/off
      // -----------------------------------------------------------------------
      case "noiseGateOut": {
        const payload = Buffer.from([value ? 0x00 : 0x01]);
        await device.sendControl(
          FuncCode.NOISE_GATE,
          channel,
          payload,
          1 /* Output */,
        );
        break;
      }

      default:
        return Response.json(
          { error: `Unknown action: ${action as string}` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("[amp-actions] sendControl error:", err);
    return Response.json(
      {
        error: `Command failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, mac, action, channel, value });
}
