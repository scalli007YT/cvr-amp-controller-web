import dgram from "dgram";

const AMP_SEND_PORT = 45455;
const PC_RECV_PORT = 45454;
const NETWORK_DATA_FLAG = 0x0000d903;

export interface NetworkData {
  dataFlag: number;
  packetsCount: number;
  packetsLastlen: number;
  packetsStep: number;
  dataState: number;
  machineMode: number;
}

export interface StructHeader {
  head: number;
  functionCode: number;
  statusCode: number;
  chx: number;
  link: number;
  inOutFlag: number;
  segment: number;
  r1: number;
  r2: number;
  r3: number;
}

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
  static SOURCE_DZDY = 49;
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
  static BACK_SW_FILTER = 73;
  static ANALOG_TYPE = 79;
  static POWER_ALLOT = 81;
  static CH_NAME = 0x4d; // 77
}

function networkDataToBytes(nd: NetworkData): Buffer {
  const buf = Buffer.alloc(10);
  buf.writeUInt32LE(nd.dataFlag, 0);
  buf.writeUInt8(nd.packetsCount, 4);
  buf.writeUInt16LE(nd.packetsLastlen, 5);
  buf.writeUInt8(nd.packetsStep, 7);
  buf.writeUInt8(nd.dataState, 8);
  buf.writeUInt8(nd.machineMode, 9);
  return buf;
}

function structHeaderToBytes(sh: StructHeader): Buffer {
  const buf = Buffer.alloc(10);
  buf[0] = sh.head;
  buf[1] = sh.functionCode;
  buf[2] = sh.statusCode;
  buf[3] = sh.chx;
  buf[4] = sh.link;
  buf[5] = sh.inOutFlag;
  buf[6] = sh.segment;
  buf[7] = sh.r1;
  buf[8] = sh.r2;
  buf[9] = sh.r3;
  return buf;
}

function getCheckCode(frame: Buffer): Buffer {
  const length = frame.length;
  const num = length + 3;
  let sum = frame.reduce((acc, byte) => acc + byte, 0);
  sum += num + (num >> 8);

  const hi = (num >> 8) & 0xff;
  const lo = num & 0xff;
  const chk = sum & 0xff;

  return Buffer.from([hi, lo, chk]);
}

export class CvrAmpDevice {
  private ampIp: string;
  private socket: dgram.Socket | null = null;

  constructor(ampIp: string) {
    this.ampIp = ampIp;
  }

  private ensureSocket(
    retries: number = 3,
    retryDelay: number = 100,
  ): Promise<dgram.Socket> {
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
          if (
            retriesLeft > 0 &&
            (err.message.includes("EADDRINUSE") || err.message.includes("bind"))
          ) {
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
              exclusive: false,
            },
            () => {
              clearTimeout(bindTimeout);
              this.socket!.removeListener("error", errorHandler);
              resolve(this.socket!);
            },
          );
        } catch (err) {
          clearTimeout(bindTimeout);
          errorHandler(err instanceof Error ? err : new Error(String(err)));
        }
      };

      attemptBind(retries);
    });
  }

  private async sendRaw(
    header: StructHeader,
    body: Buffer = Buffer.alloc(0),
  ): Promise<Buffer> {
    const sock = await this.ensureSocket();
    const inner = Buffer.concat([structHeaderToBytes(header), body]);
    const checkCode = getCheckCode(inner);
    const frame = Buffer.concat([inner, checkCode]);

    const nd: NetworkData = {
      dataFlag: NETWORK_DATA_FLAG,
      packetsCount: 1,
      packetsLastlen: frame.length,
      packetsStep: 1,
      dataState: 0,
      machineMode: 0,
    };

    const packet = Buffer.concat([networkDataToBytes(nd), frame]);

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

      sock.send(
        packet,
        0,
        packet.length,
        AMP_SEND_PORT,
        this.ampIp,
        (err: Error | null) => {
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
        },
      );
    });
  }

  private async querySNTable(): Promise<Buffer> {
    const header: StructHeader = {
      head: 0x55,
      functionCode: FuncCode.SN_TABLE,
      statusCode: 2,
      chx: 0,
      link: 0,
      inOutFlag: 0,
      segment: 0,
      r1: 0,
      r2: 0,
      r3: 0,
    };

    const sock = await this.ensureSocket();
    const inner = Buffer.concat([structHeaderToBytes(header)]);
    const frame = Buffer.concat([inner, getCheckCode(inner)]);
    const nd: NetworkData = {
      dataFlag: NETWORK_DATA_FLAG,
      packetsCount: 1,
      packetsLastlen: frame.length,
      packetsStep: 1,
      dataState: 0,
      machineMode: 0,
    };
    const packet = Buffer.concat([networkDataToBytes(nd), frame]);

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
          null,
        );
        if (best && best.length >= 116) {
          resolve(best);
        } else {
          reject(new Error("SN_TABLE response too short or missing"));
        }
      }, 200);
    });
  }

  async queryBasicInfo(): Promise<AmpDeviceInfo> {
    const basicHeader: StructHeader = {
      head: 0x55,
      functionCode: FuncCode.BASIC_INFO,
      statusCode: 2,
      chx: 0,
      link: 0,
      inOutFlag: 0,
      segment: 0,
      r1: 0,
      r2: 0,
      r3: 0,
    };

    // Run sequentially — both share the same socket, parallel use causes interference
    const basicResponse = await this.sendRaw(basicHeader);
    const snResponse = await this.querySNTable();

    return {
      name: this.parseDeviceName(basicResponse),
      mac: this.parseMacAddress(basicResponse),
      deviceVersion: this.parseDeviceVersion(basicResponse),
      identifier: this.parseIdentifier(snResponse),
      runtime: this.parseRuntime(snResponse),
    };
  }

  private parseDeviceName(response: Buffer): string {
    // Device name - scan for a readable ASCII string containing spaces (characteristic of device names)
    // Usually comes after device version
    try {
      if (response.length > 40) {
        let candidate = "";
        let inString = false;

        for (let i = 40; i < Math.min(response.length, 100); i++) {
          const byte = response[i];

          if (byte >= 32 && byte <= 126) {
            // Printable ASCII
            candidate += String.fromCharCode(byte);
            inString = true;
          } else if (inString) {
            // End of ASCII string
            if (candidate.includes(" ") && candidate.length > 5) {
              // Found a multi-word string - likely the device name
              return candidate.trim();
            }
            candidate = "";
            inString = false;
          }
        }

        // Check final candidate
        if (candidate.includes(" ") && candidate.length > 5) {
          return candidate.trim();
        }
      }
    } catch (err) {
      // Silent fail
    }
    return "Unknown";
  }

  private parseMacAddress(response: Buffer): string {
    // MAC address is 6 bytes at offset 84
    try {
      if (response.length > 90) {
        // MAC is at fixed offset 84
        const macBytes = response.slice(84, 90);

        // Verify it's not all zeros
        const sum = macBytes.reduce((a, b) => a + b, 0);
        if (sum > 0) {
          const mac = Array.from(macBytes)
            .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
            .join(":");
          return mac;
        }
      }
    } catch (err) {
      // Silent fail
    }
    return "00:00:00:00:00:00";
  }

  private parseDeviceVersion(response: Buffer): string {
    // Device version - scan from offset 20 looking for hex/alphanumeric string with hyphens
    try {
      if (response.length > 20) {
        let version = "";
        // Start from offset 20 and collect hex digits, letters, and hyphens
        for (let i = 20; i < Math.min(response.length, 120); i++) {
          const byte = response[i];
          // Collect hex digits (0-9, A-F, a-f), letters (A-Z, a-z), and hyphens
          if (
            (byte >= 48 && byte <= 57) || // 0-9
            (byte >= 65 && byte <= 90) || // A-Z
            (byte >= 97 && byte <= 122) || // a-z
            byte === 45 // hyphen
          ) {
            version += String.fromCharCode(byte);
          } else if (version.length > 0 && version.includes("-")) {
            // We've found a version string with hyphens, stop here
            return version;
          } else if (byte > 0 && byte < 32) {
            // Hit non-printable, reset
            version = "";
          }
        }

        // Check if we collected a valid version at the end
        if (version.length > 10 && version.includes("-")) {
          return version;
        }
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

  async setMute(
    channel: string,
    muted: boolean,
    retries: number = 3,
  ): Promise<void> {
    const channelIndex = this.parseChannel(channel);

    const header: StructHeader = {
      head: 0x55,
      functionCode: FuncCode.MUTE,
      statusCode: 1,
      chx: channelIndex,
      link: 0,
      inOutFlag: 0,
      segment: 0,
      r1: 0,
      r2: 0,
      r3: 1,
    };

    const body = Buffer.from([muted ? 0x00 : 0x01]);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await this.sendRaw(header, body);
        return; // Success
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // If this is the last attempt, throw the error
        if (attempt === retries - 1) {
          throw lastError;
        }
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  private parseChannel(ch: string): number {
    const s = ch.trim().toUpperCase();
    const mapping: { [key: string]: number } = {
      A: 0,
      B: 1,
      C: 2,
      D: 3,
    };

    const index = mapping[s];
    if (index === undefined) {
      throw new Error(`Invalid channel '${ch}'. Expected one of: A, B, C, D.`);
    }
    return index;
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
