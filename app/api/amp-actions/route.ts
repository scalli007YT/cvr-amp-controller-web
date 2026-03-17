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
 *   channel: number,         // channel index (0-based)
 *   value:  boolean | number  // action-specific payload
 * }
 *
 * Supported actions:
 *
 *   "muteIn"  — FC=10 MUTE, in_out_flag=0 (input)
 *   "volumeOut" — FC=9 VOL, observed output-volume control/readback on current amps
 *   "bridgePair" — FC=50 BRIDGE, pair channel=0 (A/B) or 1 (C/D)
 *   "muteOut" — FC=10 MUTE, in_out_flag=1 (Output)
 *   "invertPolarityOut" — FC=18 INVERTED, in_out_flag=1 (Output)
 *   "noiseGateOut" — FC=69 NOISE_GATE, in_out_flag=1 (Output)
 *     value: true=mute, false=unmute
 *     Wire body: 0x00=muted, 0x01=unmuted  (confirmed from C# source)
 *     C# source: Channels.cs    → SendStruct(MUTE, ch, in_out_flag.input,  link, mute_data)
 *                Channels_out.cs → SendStruct(MUTE, ch, in_out_flag.Output, link, mute_data)
 *
 *   "crossoverEnabled" — FC=30 FILTER_TYPE, link=0 (HP) or 9 (LP), in_out_flag=0/1
 *   "crossoverFreq"    — FC=32 FILTER_FREQ, link=0 (HP) or 9 (LP), in_out_flag=0/1
 *     Both are followed by the fixed crossover commit packet observed in CVR's app.
 */

import { ampController } from "@/lib/amp-controller";
import { CvrAmpDevice, FuncCode } from "@/lib/amp-device";
import { ampActionRequestSchema, type AmpActionRequest } from "@/lib/validation/amp-actions";

export const dynamic = "force-dynamic";

const POWER_MODE_FUNC_CODE = FuncCode.DZ_DY;

const DEFAULT_CROSSOVER_TYPE = {
  hp: 0,
  lp: 4
} as const;

function getCrossoverLink(): number {
  // Link is not the HP/LP selector in the C# reference path.
  // Keep link at 0 when writing a single channel directly.
  return 0;
}

function getCrossoverSegment(kind: "hp" | "lp"): number {
  // HP = band 0, LP = band 9 in the 10-band EQ layout.
  return kind === "hp" ? 0 : 9;
}

function getCrossoverInOutFlag(target: "input" | "output"): number {
  return target === "input" ? 0 : 1;
}

function getCrossoverTypeByte(kind: "hp" | "lp", enabled: boolean, filterType: number): number {
  const normalizedType = Number.isInteger(filterType) ? filterType : DEFAULT_CROSSOVER_TYPE[kind];
  return enabled ? normalizedType : 255 - normalizedType;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ampActionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request payload",
        issues: parsed.error.issues
      },
      { status: 400 }
    );
  }

  const body: AmpActionRequest = parsed.data;
  const { mac, action, channel, value } = body;

  // Ensure controller is started
  ampController.start();

  const ip = ampController.getIpForMac(mac);
  if (!ip) {
    return Response.json({ error: `Amp ${mac} not yet discovered — is it online?` }, { status: 404 });
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
        await device.sendControl(FuncCode.MUTE, channel, payload, 0 /* input */);
        break;
      }

      // -----------------------------------------------------------------------
      // Output volume — FC=9 VOL, read back from FC=27 body[405]
      // Observed devices apply this control to the output path even though the
      // working packet shape still uses in_out_flag=0.
      // Legacy clients may still send "volumeIn".
      // -----------------------------------------------------------------------
      case "volumeOut":
      case "volumeIn": {
        const payload = Buffer.alloc(4);
        payload.writeFloatLE(value, 0);
        await device.sendControl(FuncCode.VOL, channel, payload, 0 /* input */);
        break;
      }

      // -----------------------------------------------------------------------
      // Mute output — FC=10, in_out_flag=1 (Output)
      // C# source: SendStruct(MUTE, ch, in_out_flag.Output, linkNum, mute_data)
      // Wire body: 0x00=muted, 0x01=unmuted
      // -----------------------------------------------------------------------
      case "muteOut": {
        const payload = Buffer.from([value ? 0x00 : 0x01]);
        await device.sendControl(FuncCode.MUTE, channel, payload, 1 /* Output */);
        break;
      }

      // -----------------------------------------------------------------------
      // Output polarity invert — FC=18, in_out_flag=1 (Output)
      // Wire body: 0x00 = normal polarity, 0x01 = inverted polarity
      // Readback parser confirms non-zero means polarity flipped.
      // -----------------------------------------------------------------------
      case "invertPolarityOut": {
        const payload = Buffer.from([value ? 0x01 : 0x00]);
        await device.sendControl(FuncCode.PHASE, channel, payload, 1 /* Output */);
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
        await device.sendControl(FuncCode.NOISE_GATE, channel, payload, 1 /* Output */);
        break;
      }

      // -----------------------------------------------------------------------
      // RMS limiter bypass toggle — FC=48, in_out_flag=1 (Output)
      // Preferred path: FC=55 RMS_LIMITER full payload write when params are provided.
      // Fallback path: FC=48 RMS_BYPASS one-byte toggle.
      // -----------------------------------------------------------------------
      case "rmsLimiterOut": {
        if (
          typeof body.attackMs === "number" &&
          typeof body.releaseMultiplier === "number" &&
          typeof body.thresholdVrms === "number"
        ) {
          const payload = Buffer.alloc(8);
          payload.writeUInt16LE(body.attackMs, 0);
          payload.writeUInt8(body.releaseMultiplier, 2);
          payload.writeFloatLE(body.thresholdVrms, 3);
          payload.writeUInt8(value ? 0x00 : 0x01, 7); // 0=enabled, 1=bypassed

          await device.sendControl(FuncCode.RMS_LIMITER, channel, payload, 1 /* Output */);
        } else {
          const payload = Buffer.from([value ? 0x00 : 0x01]);
          await device.sendControl(FuncCode.RMS_BYPASS, channel, payload, 1 /* Output */);
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Peak limiter bypass toggle — FC=47, in_out_flag=1 (Output)
      // Preferred path: FC=54 PEAK_LIMITER full payload write when params are provided.
      // Fallback path: FC=47 PEAK_BYPASS one-byte toggle.
      // -----------------------------------------------------------------------
      case "peakLimiterOut": {
        if (
          typeof body.holdMs === "number" &&
          typeof body.releaseMs === "number" &&
          typeof body.thresholdVp === "number"
        ) {
          const payload = Buffer.alloc(9);
          payload.writeUInt16LE(body.holdMs, 0);
          payload.writeUInt16LE(body.releaseMs, 2);
          payload.writeFloatLE(body.thresholdVp, 4);
          payload.writeUInt8(value ? 0x00 : 0x01, 8); // 0=enabled, 1=bypassed

          await device.sendControl(FuncCode.PEAK_LIMITER, channel, payload, 1 /* Output */);
        } else {
          const payload = Buffer.from([value ? 0x00 : 0x01]);
          await device.sendControl(FuncCode.PEAK_BYPASS, channel, payload, 1 /* Output */);
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Matrix crosspoint gain — FC=12 ROUTING
      // Body: [float32 gain_dB LE][uint8 active_flag]
      // chx = output channel (0-3), segment = source input index (0-3)
      // -----------------------------------------------------------------------
      case "matrixGain": {
        const payload = Buffer.alloc(5);
        payload.writeFloatLE(value, 0);
        payload.writeUInt8(1, 4); // keep active when changing gain
        await device.sendControl(FuncCode.ROUTING, channel, payload, 1 /* Output */, 0, body.source);
        break;
      }

      // -----------------------------------------------------------------------
      // Matrix crosspoint active toggle — FC=12 ROUTING
      // Body: [float32 gain_dB LE][uint8 active_flag]
      // When deactivating, send current gain with active=0.
      // When activating, send 0 dB gain with active=1.
      // -----------------------------------------------------------------------
      case "matrixActive": {
        const payload = Buffer.alloc(5);
        payload.writeFloatLE(0, 0); // gain=0 dB (caller can set gain separately)
        payload.writeUInt8(value ? 1 : 0, 4);
        await device.sendControl(FuncCode.ROUTING, channel, payload, 1 /* Output */, 0, body.source);
        break;
      }

      // -----------------------------------------------------------------------
      // Source selection mode — FC=11 SOURCE
      // Body: Source_data { byte Source }
      //   0 = Analog
      //   1 = Digital (Dante on Dante-capable models, AES3 on AES-only models)
      //   2 = AES3
      // Backup is managed by priority/auto-source controls in the original app,
      // not by writing SOURCE as a dedicated mode.
      // -----------------------------------------------------------------------
      case "sourceType": {
        const payload = Buffer.from([value]);
        await device.sendControl(FuncCode.SOURCE_SELECT, channel, payload, 0 /* input */);
        break;
      }

      // -----------------------------------------------------------------------
      // Source delay update — FC=63 Source_data_code (gain_matching_data)
      // Header segment selects source family: 0=Analog, 1=Dante, 2=AES3.
      // Body layout (8 bytes): [float32 trim][float32 delay]
      // -----------------------------------------------------------------------
      case "sourceDelay": {
        const payload = Buffer.alloc(8);
        payload.writeFloatLE(body.trim, 0);
        payload.writeFloatLE(value, 4);
        await device.sendControl(FuncCode.SOURCE_DATA, channel, payload, 0 /* input */, 0, body.source);
        break;
      }

      // -----------------------------------------------------------------------
      // Source trim update — FC=63 Source_data_code (gain_matching_data)
      // Header segment selects source family: 0=Analog, 1=Dante, 2=AES3.
      // Body layout (8 bytes): [float32 trim][float32 delay]
      // -----------------------------------------------------------------------
      case "sourceTrim": {
        const payload = Buffer.alloc(8);
        payload.writeFloatLE(value, 0);
        payload.writeFloatLE(body.delay, 4);
        await device.sendControl(FuncCode.SOURCE_DATA, channel, payload, 0 /* input */, 0, body.source);
        break;
      }

      // -----------------------------------------------------------------------
      // Analog input type selection — FC=79 Analog_Matrix_input
      // Body: byte analog type/index (model-specific mapping)
      // Packet shape matches original capture: FC=0x4F, 1-byte payload.
      // -----------------------------------------------------------------------
      case "analogType": {
        const payload = Buffer.from([value & 0xff]);
        await device.sendControl(FuncCode.ANALOG_TYPE, channel, payload, 0 /* input */);
        break;
      }

      // -----------------------------------------------------------------------
      // Input delay — FC=14, in_out_flag=0 (input)
      // Wire body: float32 LE (milliseconds)
      // -----------------------------------------------------------------------
      case "delayIn": {
        const payload = Buffer.alloc(4);
        payload.writeFloatLE(value, 0);
        await device.sendControl(FuncCode.DELAY, channel, payload, 0 /* input */);
        break;
      }

      // -----------------------------------------------------------------------
      // Output delay — FC=14, in_out_flag=1 (Output)
      // Wire body: float32 LE (milliseconds)
      // -----------------------------------------------------------------------
      case "delayOut": {
        const payload = Buffer.alloc(4);
        payload.writeFloatLE(value, 0);
        await device.sendControl(FuncCode.DELAY, channel, payload, 1 /* Output */);
        break;
      }

      // -----------------------------------------------------------------------
      // Output trim/volume — FC=9, in_out_flag=1 (Output)
      // On the original 118/IAG controller path this output control is bound to
      // VolumeOut / vol_out, encoded as float32 dB and read back from FC=27.
      // -----------------------------------------------------------------------
      case "outputTrim": {
        const payload = Buffer.alloc(4);
        payload.writeFloatLE(value, 0);
        await device.sendControl(FuncCode.VOL, channel, payload, 1 /* Output */);
        break;
      }

      // -----------------------------------------------------------------------
      // Output power mode (Low-Z / 70V / 100V) — FC=49 DZ_DY_data_code
      // Body: DZ_DY { CPCR: byte }
      //   0 = Low-Z
      //   1 = 70V
      //   2 = 100V
      // Uses the per-channel write path from the original controller rather than
      // the larger FC=81 Power_Allot block.
      // -----------------------------------------------------------------------
      case "powerModeOut": {
        const payload = Buffer.from([value]);
        await device.sendControl(POWER_MODE_FUNC_CODE, channel, payload, 1 /* Output */);
        break;
      }

      // -----------------------------------------------------------------------
      // Bridge mode toggle — FC=50 BRIDGE
      // chx = pair index (0 => A/B, 1 => C/D)
      // body: 0x00 = bridged, 0x01 = unbridged
      // -----------------------------------------------------------------------
      case "bridgePair": {
        const payload = Buffer.from([value ? 0x00 : 0x01]);
        await device.sendControl(FuncCode.BRIDGE, channel, payload, 0);
        break;
      }

      // -----------------------------------------------------------------------
      // Input/output crossover enable/disable — FC=30 FILTER_TYPE
      // segment=0 selects HP, segment=9 selects LP.
      // Enabled body = filter type, disabled body = 255 - filter type.
      // Device requires a follow-up commit packet after crossover changes.
      // -----------------------------------------------------------------------
      case "crossoverEnabled": {
        const payload = Buffer.from([getCrossoverTypeByte(body.kind, value, body.filterType)]);
        await device.sendControl(
          FuncCode.FILTER_TYPE,
          channel,
          payload,
          getCrossoverInOutFlag(body.target),
          getCrossoverLink(),
          getCrossoverSegment(body.kind)
        );
        await device.commitCrossover();
        break;
      }

      // -----------------------------------------------------------------------
      // Input/output crossover frequency — FC=32 FILTER_FREQ
      // segment=0 selects HP, segment=9 selects LP.
      // Device requires a follow-up commit packet after crossover changes.
      // -----------------------------------------------------------------------
      case "crossoverFreq": {
        const payload = Buffer.alloc(4);
        payload.writeFloatLE(value, 0);
        await device.sendControl(
          FuncCode.FILTER_FREQ,
          channel,
          payload,
          getCrossoverInOutFlag(body.target),
          getCrossoverLink(),
          getCrossoverSegment(body.kind)
        );
        await device.commitCrossover();
        break;
      }

      // -----------------------------------------------------------------------
      // Parametric EQ band type / bypass — FC=30 FILTER_TYPE
      // segment = band index (1-8).
      // Bypass encoding mirrors parse: enabled → type as-is; bypassed → 255 - type.
      // -----------------------------------------------------------------------
      case "eqBandType": {
        const typeByte = body.bypass ? 255 - body.value : body.value;
        const payload = Buffer.from([typeByte]);
        await device.sendControl(FuncCode.FILTER_TYPE, channel, payload, body.target === "input" ? 0 : 1, 0, body.band);
        break;
      }

      // -----------------------------------------------------------------------
      // Parametric EQ band frequency — FC=32 FILTER_FREQ
      // segment = band index (1-8). Body: float32 LE (Hz).
      // -----------------------------------------------------------------------
      case "eqBandFreq": {
        const payload = Buffer.alloc(4);
        payload.writeFloatLE(value, 0);
        await device.sendControl(FuncCode.FILTER_FREQ, channel, payload, body.target === "input" ? 0 : 1, 0, body.band);
        break;
      }

      // -----------------------------------------------------------------------
      // Parametric EQ band gain (boost) — FC=31 FILTER_GAIN
      // segment = band index (1-8). Body: float32 LE (dB).
      // FC=31 maps to the gain field (offset 1) of the EQ band struct.
      // FC=33 (FILTER_FREQ_BOOST) is a different command and must NOT be used here.
      // -----------------------------------------------------------------------
      case "eqBandGain": {
        const payload = Buffer.alloc(4);
        payload.writeFloatLE(value, 0);
        await device.sendControl(FuncCode.FILTER_GAIN, channel, payload, body.target === "input" ? 0 : 1, 0, body.band);
        break;
      }

      // -----------------------------------------------------------------------
      // Parametric EQ band Q factor — FC=34 FILTER_Q
      // segment = band index (1-8). Body: float32 LE (Q value).
      // -----------------------------------------------------------------------
      case "eqBandQ": {
        const payload = Buffer.alloc(4);
        payload.writeFloatLE(value, 0);
        await device.sendControl(FuncCode.FILTER_Q, channel, payload, body.target === "input" ? 0 : 1, 0, body.band);
        break;
      }

      default:
        return Response.json({ error: `Unknown action: ${action as string}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[amp-actions] sendControl error:", err);
    return Response.json(
      {
        error: `Command failed: ${err instanceof Error ? err.message : String(err)}`
      },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, mac, action, channel, value });
}
