import dgram from "dgram";
import { buildProtocolPacket, type StructHeaderFields } from "@/lib/network/protocol";

const AMP_SEND_PORT = 45455;
// CvrAmpDevice uses an ephemeral port (0) for short-lived unicast commands
// so it never conflicts with the AmpController's persistent bind on 45454.
// Amps reply to the source port of the incoming request, so this works fine.
const PC_RECV_PORT = 0;
// Original C# layout is: data_flag(uint16)=0xd903, machine_mode(int16), then
// packet counters/state. Bytes like 03 d9 94 01 therefore mean machine_mode
// = 0x0194, not a different protocol flag.
const CROSSOVER_COMMIT_PACKET = Buffer.from("03d99401015c0001015a", "hex");

export interface AmpDeviceInfo {
  name: string;
  mac: string;
  deviceVersion: string;
  identifier: string;
  runtime: string; // formatted as "Xh-Ymin"
}

export class FuncCode {
  static BASIC_INFO = 0;
  static AUTO_STANDBY = 1;
  static AUTO_STANDBY_TIME = 2;
  static HEARTBEAT = 6;
  static VOL = 9;
  static MUTE = 10;
  static SOURCE_SELECT = 11;
  static ROUTING = 12;
  static GAIN = 13;
  static DELAY = 14;
  static STANDBY_DATA = 15;
  static PHASE = 18;
  static DYN_EQ = 25;
  static SYNC_DATA = 27;
  static CHECK_VERSION = 28;
  static FW_STEP_RESULT = 29;
  static FILTER_TYPE = 30;
  static FILTER_GAIN = 31;
  static FILTER_FREQ = 32;
  static FILTER_FREQ_BOOST = 33;
  static FILTER_Q = 34;
  static CH_EQ_BYPASS = 36;
  static RMS_THRESH = 39;
  static PEAK_HOLD = 40;
  static PEAK_RELEASE = 41;
  static PEAK_THRESH = 42;
  static FIR_DATA = 43;
  static FIR_BYPASS = 44;
  static PEAK_BYPASS = 47;
  static RMS_BYPASS = 48;
  static DZ_DY = 49;
  static SOURCE_DZDY = 49; // legacy alias
  static BRIDGE = 50;
  static CH_DATA = 51;
  static EQ = 52;
  static DYN_EQ2 = 53;
  static PEAK_LIMITER = 54;
  static RMS_LIMITER = 55;
  static SPEAKER_DATA = 57;
  static SAVE_RECALL = 59;
  static FEEDBACK = 65;
  static FEEDBACK_BYPASS = 66;
  static IOS_DATA = 68;
  static NOISE_GATE = 69;
  static KNOB_VOL = 70;
  static SN_TABLE = 71;
  static CUSTOMER_NAME_MODIFY = 60; // 0x3C, confirmed by captured rename packet
  static BACK_SW_FILTER = 73;
  static SOURCE_DATA = 62;
  static ANALOG_TYPE = 79;
  static POWER_ALLOT = 81;
  static MONO_SWITCH = 77;
  static SPEAKER_NAME = 78;
}

export class CvrAmpDevice {
  private ampIp: string;
  private socket: dgram.Socket | null = null;

  constructor(ampIp: string) {
    this.ampIp = ampIp;
  }

  private ensureSocket(retries: number = 3, retryDelay: number = 100): Promise<dgram.Socket> {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        resolve(this.socket);
        return;
      }

      const attemptBind = (retriesLeft: number) => {
        this.socket = dgram.createSocket("udp4");
        this.socket.setMaxListeners(10);

        const bindTimeout = setTimeout(() => {
          if (this.socket) {
            this.socket.close();
            this.socket = null;
          }
          reject(new Error("Socket bind timeout"));
        }, 500);

        const errorHandler = (err: Error) => {
          clearTimeout(bindTimeout);
          if (this.socket) {
            this.socket.close();
            this.socket = null;
          }

          // Retry on EADDRINUSE errors
          if (retriesLeft > 0 && (err.message.includes("EADDRINUSE") || err.message.includes("bind"))) {
            setTimeout(() => attemptBind(retriesLeft - 1), retryDelay);
          } else {
            reject(err);
          }
        };

        this.socket.on("error", errorHandler);

        try {
          this.socket.bind(
            {
              port: PC_RECV_PORT,
              address: "0.0.0.0",
              exclusive: false
            },
            () => {
              clearTimeout(bindTimeout);
              this.socket!.removeListener("error", errorHandler);
              resolve(this.socket!);
            }
          );
        } catch (err) {
          clearTimeout(bindTimeout);
          errorHandler(err instanceof Error ? err : new Error(String(err)));
        }
      };

      attemptBind(retries);
    });
  }

  private async sendRaw(header: StructHeaderFields, body: Buffer = Buffer.alloc(0), machineMode = 0): Promise<Buffer> {
    const sock = await this.ensureSocket();
    const packet = buildProtocolPacket({
      ...header,
      body,
      machineMode,
      dataState: 0,
      packetsCount: 1,
      packetsStep: 1
    });

    return new Promise((resolve, reject) => {
      let responded = false;

      const timeout = setTimeout(() => {
        responded = true;
        sock.removeListener("message", messageHandler);
        sock.removeListener("error", errorHandler);
        // Close socket on timeout to ensure port is released
        if (this.socket) {
          this.socket.close();
          this.socket = null;
        }
        reject(new Error("Response timeout (75ms)"));
      }, 75);

      const messageHandler = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        if (!responded && rinfo.address === this.ampIp) {
          responded = true;
          clearTimeout(timeout);
          sock.removeListener("message", messageHandler);
          sock.removeListener("error", errorHandler);
          resolve(msg);
        }
      };

      const errorHandler = (err: Error) => {
        if (!responded) {
          responded = true;
          clearTimeout(timeout);
          sock.removeListener("message", messageHandler);
          sock.removeListener("error", errorHandler);
          reject(err);
        }
      };

      sock.on("message", messageHandler);
      sock.on("error", errorHandler);

      sock.send(packet, 0, packet.length, AMP_SEND_PORT, this.ampIp, (err: Error | null) => {
        if (err) {
          responded = true;
          clearTimeout(timeout);
          sock.removeListener("message", messageHandler);
          sock.removeListener("error", errorHandler);
          // Close socket on send error
          if (this.socket) {
            this.socket.close();
            this.socket = null;
          }
          reject(err);
        }
      });
    });
  }

  private async querySNTable(): Promise<Buffer> {
    const header: StructHeaderFields = {
      functionCode: FuncCode.SN_TABLE,
      statusCode: 2,
      chx: 0,
      link: 0,
      inOutFlag: 0,
      segment: 0
    };

    const sock = await this.ensureSocket();
    const packet = buildProtocolPacket({
      ...header,
      body: Buffer.alloc(0),
      machineMode: 0,
      dataState: 0,
      packetsCount: 1,
      packetsStep: 1
    });

    // The device sends two responses: a 10-byte ack first, then the real 116-byte payload.
    // We collect for 200ms and return the largest packet.
    return new Promise((resolve, reject) => {
      const collected: Buffer[] = [];

      const collector = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        if (rinfo.address === this.ampIp) {
          collected.push(Buffer.from(msg));
        }
      };

      sock.on("message", collector);
      sock.send(packet, 0, packet.length, AMP_SEND_PORT, this.ampIp, (err) => {
        if (err) {
          sock.removeListener("message", collector);
          reject(err);
        }
      });

      setTimeout(() => {
        sock.removeListener("message", collector);
        const best = collected.reduce<Buffer | null>(
          (acc, cur) => (acc === null || cur.length > acc.length ? cur : acc),
          null
        );
        if (best && best.length >= 100) {
          resolve(best);
        } else {
          reject(new Error(`SN_TABLE response too short or missing (got ${best?.length ?? 0} bytes)`));
        }
      }, 200);
    });
  }

  async queryBasicInfo(): Promise<AmpDeviceInfo> {
    const basicHeader: StructHeaderFields = {
      functionCode: FuncCode.BASIC_INFO,
      statusCode: 2,
      chx: 0,
      link: 0,
      inOutFlag: 0,
      segment: 0
    };

    // Run sequentially — both share the same socket, parallel use causes interference
    const basicResponse = await this.sendRaw(basicHeader, Buffer.alloc(0), 0);
    const snResponse = await this.querySNTable();

    return {
      name: this.parseDeviceName(basicResponse),
      mac: this.parseMacAddress(basicResponse),
      deviceVersion: this.parseDeviceVersion(basicResponse),
      identifier: this.parseIdentifier(snResponse),
      runtime: this.parseRuntime(snResponse)
    };
  }

  async queryRuntime(): Promise<number | undefined> {
    // Fetch SN_TABLE (FC=71) and parse runtime minutes.
    // Full-packet offset 94 = NetworkData(10) + StructHeader(10) + body[74].
    try {
      const snResponse = await this.querySNTable();
      if (snResponse.length >= 98) {
        return snResponse.readUInt32LE(94);
      }
    } catch (err) {
      console.warn("[CvrAmpDevice] queryRuntime failed:", err);
    }
    return undefined;
  }

  /**
   * Request the device's preset/profile names list (Save/Recall, FC=59, mode=0).
   *
   * Protocol (from C# source analysis):
   *   - Send: StructHeader { FC=59, statusCode=2 (Request), chx=0, inOutFlag=0 }
   *           + body: Save_Recall_data { mode=0, ch_x=0, buffers=[0×32] } = 34 zero bytes
   *   - Response body is N×32 bytes where N ∈ {16, 24, 40}:
   *       16 slots = 512 bytes  (Save_Recall_NameS)
   *       24 slots = 768 bytes  (Save_Recall_NameS_24)
   *       40 slots = 1280 bytes (Save_Recall_NameS_40)
   *   - Each 32-byte slot = null-terminated ASCII preset name, null-padded.
   *   - Offset 10 = start of StructHeader in response → body starts at offset 20.
   *
   * Returns an array of { slot: number; name: string } for non-empty slots.
   */
  async queryPresets(): Promise<{ slot: number; name: string }[]> {
    const header: StructHeaderFields = {
      functionCode: FuncCode.SAVE_RECALL, // 59
      statusCode: 2, // Request
      chx: 0,
      link: 0,
      inOutFlag: 0,
      segment: 0
    };

    // Save_Recall_data struct: mode(1) + ch_x(1) + buffers(32) = 34 bytes, all zero for mode=0
    const body = Buffer.alloc(34, 0);

    const sock = await this.ensureSocket();
    const packet = buildProtocolPacket({
      ...header,
      body,
      machineMode: 0,
      dataState: 0,
      packetsCount: 1,
      packetsStep: 1
    });

    // Device may send multiple packets — collect for 400ms and pick the largest response
    return new Promise((resolve) => {
      const collected: Buffer[] = [];

      const collector = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        if (rinfo.address === this.ampIp) {
          collected.push(Buffer.from(msg));
        }
      };

      sock.on("message", collector);
      sock.send(packet, 0, packet.length, AMP_SEND_PORT, this.ampIp, (err) => {
        if (err) {
          sock.removeListener("message", collector);
          resolve([]);
        }
      });

      setTimeout(() => {
        sock.removeListener("message", collector);

        if (collected.length === 0) {
          resolve([]);
          return;
        }

        // The device may split a large response across multiple UDP fragments.
        // NetworkData layout (10 bytes):
        //   [0-3]  dataFlag (LE uint32)
        //   [4]    packetsCount  — total number of fragments in this response
        //   [5-6]  packetsLastlen (LE uint16) — byte length of the final fragment's frame
        //   [7]    packetsStep   — 1-based fragment index (1 = first, packetsCount = last)
        //   [8]    dataState
        //   [9]    machineMode
        //
        // Fragment reassembly:
        //   - Fragment 1 carries: StructHeader (10 bytes) + first chunk of body + (no checksum yet)
        //   - Fragments 2..N-1 carry: raw body continuation
        //   - Fragment N carries:  last body chunk + 3-byte checksum
        //   Strip the 10-byte NetworkData from each, then concatenate.
        //   Then strip the leading StructHeader (10 bytes) from the assembled frame
        //   and the trailing 3-byte checksum to get the pure body.

        // Filter out the 10-byte ACK packet (no StructHeader, just NetworkData)
        const fragments = collected.filter((p) => p.length > 10);

        if (fragments.length === 0) {
          resolve([]);
          return;
        }

        // Sort by packetsStep (byte 7 of NetworkData) so we reassemble in order
        fragments.sort((a, b) => a[7] - b[7]);

        // Concatenate frames (strip the 10-byte NetworkData prefix from each)
        const assembledFrame = Buffer.concat(fragments.map((p) => p.slice(10)));

        // assembledFrame = StructHeader(10) + body + checksum(3)
        if (assembledFrame.length < 13) {
          resolve([]);
          return;
        }

        const responseBody = assembledFrame.slice(10, assembledFrame.length - 3);

        const SLOT_SIZE = 32;

        if (responseBody.length === 0 || responseBody.length % SLOT_SIZE !== 0) {
          console.warn(`[queryPresets] Body (${responseBody.length} bytes) is not a multiple of 32`);
          resolve([]);
          return;
        }

        const slotCount = Math.min(responseBody.length / SLOT_SIZE, 40);
        const presets: { slot: number; name: string }[] = [];

        for (let i = 0; i < slotCount; i++) {
          const slotBuf = responseBody.slice(i * SLOT_SIZE, (i + 1) * SLOT_SIZE);
          const nullIdx = slotBuf.indexOf(0);
          const name = slotBuf
            .slice(0, nullIdx === -1 ? SLOT_SIZE : nullIdx)
            .toString("ascii")
            .trim();
          // Skip empty slots and device placeholder "Null" entries
          if (name.length > 0 && name.toLowerCase() !== "null") {
            presets.push({ slot: i + 1, name });
          }
        }

        resolve(presets);
      }, 400);
    });
  }

  async queryHeartbeat(): Promise<Buffer> {
    /**
     * Lightweight HEARTBEAT query (FC=6)
     * Matches original C# app's queryT_V_A() method
     * Returns real-time device status (~115 bytes)
     * Much faster and more efficient than BASIC_INFO + SN_TABLE
     */
    const header: StructHeaderFields = {
      functionCode: FuncCode.HEARTBEAT,
      statusCode: 2, // Request status
      chx: 0,
      link: 0,
      inOutFlag: 0,
      segment: 0
    };

    return this.sendRaw(header);
  }

  /**
   * Recall a preset slot from device memory.
   *
   * Confirmed from original C# source:
   *   Save_Recall_data { mode = 2, ch_x = slotIndex, buffers = [32x0] }
   *   UDP.SendStruct(Save_Recall_data_code, 0, save_Recall_data)
   *
   * Slot numbering in the UI is 1-based. Wire ch_x is 0-based.
   */
  async recallPreset(slot: number): Promise<void> {
    if (!Number.isInteger(slot) || slot < 1 || slot > 40) {
      throw new Error(`Invalid preset slot: ${slot}`);
    }

    const body = Buffer.alloc(34, 0);
    body.writeUInt8(2, 0); // mode = 2 (recall)
    body.writeUInt8(slot - 1, 1); // ch_x = zero-based slot index

    await this.sendControl(FuncCode.SAVE_RECALL, 0, body, 0 /* input/default */);
  }

  /**
   * Store (save) current device state into a preset slot.
   *
   * Confirmed from original C# source:
   *   Save_Recall_data { mode = 1, ch_x = slotIndex, buffers = name[32] }
   */
  async storePreset(slot: number, name: string): Promise<void> {
    if (!Number.isInteger(slot) || slot < 1 || slot > 40) {
      throw new Error(`Invalid preset slot: ${slot}`);
    }

    const trimmed = (name ?? "").trim();
    if (trimmed.length === 0) {
      throw new Error("Preset name cannot be empty");
    }

    const body = Buffer.alloc(34, 0);
    body.writeUInt8(1, 0); // mode = 1 (store)
    body.writeUInt8(slot - 1, 1); // ch_x = zero-based slot index

    // Device preset names are 32-byte null-padded ASCII fields.
    const nameBytes = Buffer.from(trimmed, "ascii").subarray(0, 32);
    nameBytes.copy(body, 2);

    await this.sendControl(FuncCode.SAVE_RECALL, 0, body, 0 /* input/default */);
  }

  /**
   * Commit staged crossover changes.
   *
   * Reverse-engineered from the CVR desktop app and the attached Python helper:
   * after HP/LP writes (FC=30 / FC=32), the device expects this fixed 10-byte
   * follow-up packet before the changes become active.
   */
  async commitCrossover(): Promise<void> {
    const sock = dgram.createSocket("udp4");
    await new Promise<void>((resolve, reject) => {
      sock.bind({ port: 0, address: "0.0.0.0" }, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      sock.send(CROSSOVER_COMMIT_PACKET, 0, CROSSOVER_COMMIT_PACKET.length, AMP_SEND_PORT, this.ampIp, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    try {
      sock.close();
    } catch {
      // ignore close errors
    }
  }

  /**
   * Send a fire-and-forget control command via an ephemeral UDP socket.
   *
   * Wire format derived from real packet captures (Python reverse-engineering)
   * and confirmed by reading the original C# source:
   *   - NetworkData flag: 0xd903 with machineMode=0
   *   - statusCode: 1  (all write/control commands)
   *   - inOutFlag (byte 9 of StructHeader): 0=input, 1=Output  (C# enum in_out_flag)
   *
   * An ephemeral socket (port 0) is used so the command originates from a
   * different source port than the persistent monitor socket — matching the
   * CVR Windows software behaviour.
   *
   * The amp ACKs with a short packet; we don't need it, so the socket is
   * closed after a brief wait to flush the send buffer.
   *
   * @param fc         Function code (e.g. FuncCode.MUTE = 10)
   * @param chx        Channel index 0–3
   * @param body       Command payload bytes
   * @param inOutFlag  StructHeader byte 9 (in_out_flag): 0=input, 1=Output (default 0)
   * @param link       StructHeader bytes 5-8 (Link int32): link group (default 0)
   * @param segment    StructHeader byte 4 (Segment): segment selector (default 0)
   */
  async sendControl(fc: number, chx: number, body: Buffer, inOutFlag = 0, link = 0, segment = 0): Promise<void> {
    const header: StructHeaderFields = {
      functionCode: fc,
      statusCode: 1, // Write/control — confirmed from captured packets
      chx,
      link,
      inOutFlag,
      segment
    };

    const sock = dgram.createSocket("udp4");
    await new Promise<void>((resolve, reject) => {
      sock.bind({ port: 0, address: "0.0.0.0" }, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const packet = buildProtocolPacket({
      ...header,
      body,
      machineMode: 0,
      dataState: 0,
      packetsCount: 1,
      packetsStep: 1
    });

    await new Promise<void>((resolve, reject) => {
      sock.send(packet, 0, packet.length, AMP_SEND_PORT, this.ampIp, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Give the OS ~10 ms to flush — matches Python's time.sleep(0.01) throttle
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    try {
      sock.close();
    } catch {
      // ignore close errors
    }
  }

  private parseDeviceName(response: Buffer): string {
    // Device name: fixed offset 52, max 32 bytes, null-terminated ASCII
    // e.g. "PASCAL ROSE DSP-2004"
    try {
      if (response.length >= 53) {
        const end = Math.min(52 + 32, response.length);
        const slice = response.slice(52, end);
        const nullIdx = slice.indexOf(0);
        const name = slice
          .slice(0, nullIdx === -1 ? slice.length : nullIdx)
          .toString("ascii")
          .trim();
        if (name.length > 0) return name;
      }
    } catch (err) {
      // Silent fail
    }
    return "Unknown";
  }

  private parseMacAddress(response: Buffer): string {
    // BASIC_INFO response layout variants:
    //   [0–9]   NetworkData header
    //   [10–19] StructHeader
    //   [20–43] Version string, null-terminated (24 bytes)
    //   [44–51] padding
    //   [52..]  Device name, null-terminated (24 or 32 bytes)
    //   ...     padding/reserved
    //   [84–89] or [92–97] MAC address (6 bytes)
    //   [90–98] reserved
    //   [99–101] checksum
    try {
      const candidates: Array<[number, number]> = [
        [84, 90],
        [92, 98]
      ];

      for (const [start, end] of candidates) {
        if (response.length < end) continue;
        const macBytes = response.slice(start, end);
        const sum = macBytes.reduce((a, b) => a + b, 0);
        if (sum === 0) continue;

        return Array.from(macBytes)
          .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
          .join(":");
      }
    } catch (err) {
      // Silent fail
    }
    return "00:00:00:00:00:00";
  }

  private parseDeviceVersion(response: Buffer): string {
    // Device version: fixed offset 20, max 24 bytes, null-terminated ASCII
    // e.g. "424 0B06-006118-DSP-2004"
    try {
      if (response.length >= 21) {
        const end = Math.min(20 + 24, response.length);
        const slice = response.slice(20, end);
        const nullIdx = slice.indexOf(0);
        const version = slice
          .slice(0, nullIdx === -1 ? slice.length : nullIdx)
          .toString("ascii")
          .trim();
        if (version.length > 0) return version;
      }
    } catch (err) {
      // Silent fail
    }
    return "Unknown";
  }

  private parseIdentifier(snResponse: Buffer): string {
    // SN_TABLE response (116 bytes):
    // [101-112] = 12-byte identifier (e.g. 31-AA-59-00-00-40-52-15-17-15-4D-07)
    try {
      if (snResponse.length >= 113) {
        const idBytes = snResponse.slice(101, 113);
        return Array.from(idBytes)
          .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
          .join("-");
      }
    } catch (err) {
      // Silent fail
    }
    return "00-00-00-00-00-00-00-00-00-00-00-00";
  }

  private parseRuntime(snResponse: Buffer): string {
    // SN_TABLE response (116 bytes):
    // [94-97] = uint32LE runtime in minutes (e.g. 0x000277EA = 161,770 min = 2696h-10min)
    try {
      if (snResponse.length >= 98) {
        const totalMinutes = snResponse.readUInt32LE(94);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours}h-${minutes}min`;
      }
    } catch (err) {
      // Silent fail
    }
    return "Unknown";
  }

  close(): void {
    if (this.socket) {
      try {
        this.socket.close();
        this.socket = null;
      } catch (err) {
        // Silent fail
      }
    }
  }
}

// Re-export for server-side callers that already import from this module.
export { maxDbFromDeviceName } from "./amp-model";
export { parseHeartbeat } from "./network/heartbeat-parser";
