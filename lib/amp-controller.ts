/**
 * amp-controller.ts
 *
 * Server-side singleton that faithfully mirrors the original C# UDP.cs
 * architecture, adapted for multi-amp support (all amps polled, not just one).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Receive_Thread  → one persistent UDP socket on 0.0.0.0:45454          │
 * │                    Every packet is:                                      │
 * │                      1. checksum-validated  (isSelfData equivalent)     │
 * │                      2. reassembled if multi-fragment                   │
 * │                      3. ACK'd back to sender  (setReceiveData)          │
 * │                      4. dispatched by function_code                     │
 * │                                                                          │
 * │  queryT_V_A()    → 140 ms loop, unicast FC=6 HEARTBEAT to each known    │
 * │                    amp IP in turn (multi-amp: one per tick, cycling).   │
 * │                    Falls back to broadcast when no amps are known yet.  │
 * │                    Every 25 ticks: judgeOnline() watchdog.              │
 * │                                                                          │
 * │  refrash()       → 4000 ms timer (refresh_step counter):               │
 * │                      step=1: clear window list + broadcast FC=0        │
 * │                      step=2: broadcast FC=0 again + mark offline       │
 * │                    Two-cycle grace: a device must miss TWO consecutive  │
 * │                    4s windows (~8 s) before being declared offline.    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import dgram from "dgram";
import { EventEmitter } from "events";
import { FuncCode, parseHeartbeat } from "./amp-device";
import type { HeartbeatData } from "@/stores/AmpStore";

// ---------------------------------------------------------------------------
// Constants — matching original C# values exactly
// ---------------------------------------------------------------------------
const AMP_PORT = 45455; // port amps listen on
const PC_RECV_PORT = 45454; // port we bind to receive replies
const BROADCAST_ADDR = "255.255.255.255";
const HEARTBEAT_MS = 140; // queryT_V_A Thread.Sleep(140)
const DISCOVERY_MS = 4000; // TimerRefresh.Interval = 4000
const DISCOVERY_WINDOW_MS = 1000; // MainWindow.Sleep(1000) after broadcast
const NETWORK_DATA_FLAG = 0x0194d903; // protocol identifier (bytes: 03 d9 94 01)
const FRAGMENT_SIZE = 450; // max bytes per fragment (C# byteCut chunk)
// Watchdog: if an amp hasn't sent a heartbeat in this many ms → offline
const HEARTBEAT_TIMEOUT_MS = 3_500; // 25 × 140 ms

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------
export interface DiscoveryEvent {
  ip: string;
  mac: string;
  name: string;
  version: string;
}

export interface HeartbeatEvent {
  ip: string;
  mac: string;
  name: string;
  version: string;
  heartbeat: HeartbeatData;
}

export interface OfflineEvent {
  mac: string;
}

// ---------------------------------------------------------------------------
// Fragment reassembly state per sender IP
// mirrors handleReceivedata() / Receivedata buffer in the original
// ---------------------------------------------------------------------------
interface FragmentState {
  data: Buffer; // pre-allocated full-size buffer
  totalLen: number; // (packets_count-1)*450 + packets_lastlenth
  receivedSteps: Set<number>;
  packetsCount: number;
}

// ---------------------------------------------------------------------------
// Packet builders
// ---------------------------------------------------------------------------

function buildNetworkData(frameLen: number, dataState = 0): Buffer {
  const buf = Buffer.alloc(10);
  buf.writeUInt32LE(NETWORK_DATA_FLAG, 0);
  buf[4] = 1; // packets_count
  buf.writeUInt16LE(frameLen, 5); // packets_lastlenth
  buf[7] = 1; // packets_stepcount
  buf[8] = dataState; // data_state  (0=send, 1=ack)
  buf[9] = 0; // machine_mode
  return buf;
}

function buildStructHeader(
  functionCode: number,
  statusCode: number,
  chx = 0,
): Buffer {
  const h = Buffer.alloc(10);
  h[0] = 0x55;
  h[1] = functionCode;
  h[2] = statusCode;
  h[3] = chx;
  return h;
}

function calcCheckCode(frame: Buffer): Buffer {
  const num = frame.length + 3;
  const hi = (num >> 8) & 0xff;
  const lo = num & 0xff;
  let sum = hi + lo;
  for (const b of frame) sum += b;
  return Buffer.from([hi, lo, sum & 0xff]);
}

function buildQueryPacket(
  functionCode: number,
  statusCode: number,
  body = Buffer.alloc(0),
): Buffer {
  const header = buildStructHeader(functionCode, statusCode);
  const inner = Buffer.concat([header, body]);
  const frame = Buffer.concat([inner, calcCheckCode(inner)]);
  return Buffer.concat([buildNetworkData(frame.length), frame]);
}

// ---------------------------------------------------------------------------
// Fix #6 — isSelfData() equivalent: validate head byte + checksum
// Returns the assembled inner frame (StructHeader + body, no checksum)
// or null if the packet is invalid / incomplete.
// ---------------------------------------------------------------------------
function validateAndStrip(raw: Buffer): Buffer | null {
  // Minimum: NetworkData(10) + StructHeader(10) + checksum(3) = 23 bytes
  if (raw.length < 23) return null;
  if (raw[10] !== 0x55) return null; // head check
  if (raw.readUInt32LE(0) !== NETWORK_DATA_FLAG) return null;

  // Extract the inner frame (everything after NetworkData, without checksum)
  const inner = raw.slice(10, raw.length - 3);
  const expected = calcCheckCode(inner);
  // Verify last 2 bytes of checksum (mirrors isSelfData: checkCode[1] and [2])
  if (expected[1] !== raw[raw.length - 2]) return null;
  if (expected[2] !== raw[raw.length - 1]) return null;

  return inner; // validated StructHeader(10) + body
}

// ---------------------------------------------------------------------------
// Discovery parser — FC=0 BASIC_INFO response
// Body layout after StructHeader:
//   [0-23]   version string (null-terminated ASCII, 24 bytes)
//   [8]      padding
//   [32-55]  device name (null-terminated ASCII, 24 bytes)
//   [64-69]  MAC address (6 bytes)
//
// In the full raw packet (with NetworkData prepended):
//   [10-19]  StructHeader
//   [20-43]  version
//   [52-75]  name
//   [84-89]  MAC
// ---------------------------------------------------------------------------
function parseDiscoveryPacket(raw: Buffer, ip: string): DiscoveryEvent | null {
  if (raw.length < 90) return null;
  if (raw[10] !== 0x55) return null;
  if (raw[11] !== FuncCode.BASIC_INFO) return null;

  const macBytes = raw.slice(84, 90);
  if (macBytes.reduce((a, b) => a + b, 0) === 0) return null;

  const mac = Array.from(macBytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(":");

  const verSlice = raw.slice(20, 44);
  const verNull = verSlice.indexOf(0);
  const version = verSlice
    .slice(0, verNull === -1 ? 24 : verNull)
    .toString("ascii")
    .trim();

  const nameSlice = raw.slice(52, 76);
  const nameNull = nameSlice.indexOf(0);
  const name = nameSlice
    .slice(0, nameNull === -1 ? 24 : nameNull)
    .toString("ascii")
    .trim();

  return { ip, mac, name, version };
}

// ---------------------------------------------------------------------------
// AmpController
// ---------------------------------------------------------------------------
class AmpController extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;

  // Fix #3 — refresh_step counter (mirrors C# refresh_step field)
  // step=0 → idle
  // step=1 → first broadcast sent, window MACs cleared, do NOT mark offline yet
  // step=2 → second broadcast sent, now mark offline
  private refreshStep = 0;

  /** MACs seen in the current discovery window (mirrors refresh_MacList) */
  private currentWindowMacs = new Set<string>();

  /**
   * All known online amps: MAC → { ip, name }.
   * Written by discovery, read by heartbeat loop and judgeOnline.
   */
  private knownMacs = new Map<
    string,
    { ip: string; name: string; version: string }
  >(); // mac → { ip, name, version }

  // Fix #5 — per-amp last-heartbeat timestamp for judgeOnline watchdog
  private lastHeartbeatAt = new Map<string, number>(); // mac → ms timestamp

  /** isRefresh gate (mirrors UDP.isRefresh = false during send()) */
  private isRefresh = true;

  /** Heartbeat tick counter — triggers judgeOnline every 25 ticks */
  private heartbeatCount = 0;

  // Fix #2 — per-sender fragment reassembly buffers (mirrors Receivedata + handleReceivedata)
  private fragmentBuffers = new Map<string, FragmentState>(); // key = ip

  private running = false;

  // Promise that resolves once the UDP socket is successfully bound.
  // triggerDiscovery awaits this so it never fires into a null socket.
  private _socketReadyResolve: (() => void) | null = null;
  private _socketReady: Promise<void> = new Promise(
    (res) => (this._socketReadyResolve = res),
  );

  // Pre-built query packets (re-used every tick, immutable)
  private readonly heartbeatPacket = buildQueryPacket(FuncCode.HEARTBEAT, 2);
  private readonly discoveryPacket = buildQueryPacket(FuncCode.BASIC_INFO, 2);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    // Reset the ready promise for a fresh bind cycle
    this._socketReady = new Promise((res) => (this._socketReadyResolve = res));
    this._bindSocket();
  }

  stop(): void {
    this.running = false;
    this._clearTimers();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }

  /** Pause heartbeat loop during a user command (mirrors isRefresh = false) */
  pauseHeartbeat(): void {
    this.isRefresh = false;
  }
  /** Resume heartbeat loop after a user command (mirrors isRefresh = true) */
  resumeHeartbeat(): void {
    this.isRefresh = true;
  }

  /** Returns the last known IP for a given MAC, or null if not yet discovered. */
  getIpForMac(mac: string): string | null {
    for (const [m, entry] of this.knownMacs) {
      if (m.toUpperCase() === mac.toUpperCase()) return entry.ip;
    }
    return null;
  }

  /**
   * Request FC=27 (Synchronous_data) from a specific amp/channel.
   * Handles multi-frame responses by accumulating all fragments.
   * Returns the complete body buffer (may be >437 bytes).
   * Times out after 5 seconds if no response.
   */
  public async requestFC27(mac: string, channel: number): Promise<Buffer> {
    await this._socketReady;

    const ip = this.getIpForMac(mac);
    if (!ip) {
      throw new Error(`Amp ${mac} not found or not yet discovered`);
    }

    if (!this.socket) {
      throw new Error("Socket not initialized");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`FC=27 request for ${mac}:${channel} timed out`));
      }, 5000);

      // Accumulator for multi-frame responses
      const frames: Buffer[] = [];

      // Build a one-time handler to capture the FC=27 response for this channel
      const originalDispatch = this._dispatchFC.bind(this);
      let captured = false;

      const tempDispatch = (
        fc: number,
        body: Buffer,
        srcIp: string,
        machineMode: number,
        rawAssembled: Buffer,
      ) => {
        // Only intercept FC=27 responses from the target IP
        if (fc === 27 && srcIp === ip && !captured) {
          // Accept the response regardless of channel — the amp sends all channel data
          // in a single multi-packet response
          frames.push(Buffer.from(body));

          // Mark as captured and start the final wait window
          if (!captured) {
            captured = true;
            setTimeout(() => {
              clearTimeout(timeout);
              (this as any)._dispatchFC = originalDispatch;

              // Concatenate all frames
              const complete = Buffer.concat(frames);
              resolve(complete);
            }, 100); // Wait 100ms for any remaining fragments
          }
          return;
        }

        // Pass through to normal dispatch
        originalDispatch(fc, body, srcIp, machineMode, rawAssembled);
      };

      // Temporarily replace dispatch handler
      (this as any)._dispatchFC = tempDispatch;

      // Build and send the FC=27 request
      try {
        const sock = this.socket;
        if (!sock) throw new Error("Socket lost");

        const header = buildStructHeader(27, 2, channel);
        const inner = Buffer.concat([header]);
        const frame = Buffer.concat([inner, calcCheckCode(inner)]);
        const packet = Buffer.concat([buildNetworkData(frame.length), frame]);

        sock.send(packet, 0, packet.length, AMP_PORT, ip);
      } catch (err) {
        clearTimeout(timeout);
        (this as any)._dispatchFC = originalDispatch;
        reject(err);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Socket — Receive_Thread equivalent
  // -------------------------------------------------------------------------
  private _bindSocket(): void {
    const sock = dgram.createSocket("udp4");
    this.socket = sock;

    sock.on("error", (err) => {
      console.error("[AmpController] Socket error:", err.message);
      this._clearTimers();
      try {
        sock.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
      // mirrors the C# "goto IL_00" restart
      setTimeout(() => {
        if (this.running) this._bindSocket();
      }, 500);
    });

    sock.on("message", (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      this._onPacket(msg, rinfo.address);
    });

    sock.bind(
      { port: PC_RECV_PORT, address: "0.0.0.0", exclusive: false },
      () => {
        sock.setBroadcast(true);
        console.log(
          `[AmpController] Socket bound on 0.0.0.0:${PC_RECV_PORT} — starting loops`,
        );
        // Resolve the ready promise so triggerDiscovery() can proceed
        this._socketReadyResolve?.();
        this._socketReadyResolve = null;
        this._startHeartbeatLoop();
        this._startDiscoveryTimer();
        // Immediate broadcast on startup (mirrors initUDP2 → Sendrefrash)
        this._sendDiscovery();
      },
    );
  }

  // -------------------------------------------------------------------------
  // Receive_Thread — full ReceiveMessage() + setReceiveData() pipeline
  //
  // For every arriving UDP packet:
  //   1. Validate data_flag
  //   2. Reassemble fragments (handleReceivedata equivalent)
  //   3. Send ACK back to sender (setReceiveData sets data_state=1 and replies)
  //   4. If all fragments have arrived: validate checksum, dispatch FC handler
  // -------------------------------------------------------------------------
  private _onPacket(raw: Buffer, ip: string): void {
    if (raw.length < 10) return;

    // --- Step 1: validate data_flag ---
    if (raw.readUInt32LE(0) !== NETWORK_DATA_FLAG) return;

    // Parse NetworkData header
    const packetsCount = raw[4];
    const packetsLastlen = raw.readUInt16LE(5);
    const packetsStep = raw[7]; // 1-based fragment index
    const dataState = raw[8];
    const machineMode = raw[9];

    // data_state=1 means this is an ACK we sent ourselves, reflected back — ignore
    if (dataState === 1) return;

    // --- Step 2: ACK back to sender (Fix #1) ---
    // mirrors: networkData.data_state = 1; UDP_Receive.Send(SendData, ..., ACK_IP)
    // We echo the NetworkData header with data_state=1, no body.
    this._sendAck(ip, raw);

    // --- Step 3: Multi-packet reassembly (Fix #2) ---
    // mirrors handleReceivedata():
    //   totalLen = (packets_count - 1) * 450 + packets_lastlenth
    //   Receivedata[( step-1)*450 .. ] = body chunk
    const body = raw.slice(10); // everything after NetworkData
    const totalLen = (packetsCount - 1) * FRAGMENT_SIZE + packetsLastlen;

    if (totalLen <= 0) return;

    let state = this.fragmentBuffers.get(ip);
    if (!state || state.totalLen !== totalLen) {
      // New message or different message size — reset buffer
      state = {
        data: Buffer.alloc(totalLen),
        totalLen,
        receivedSteps: new Set(),
        packetsCount,
      };
      this.fragmentBuffers.set(ip, state);
    }

    const offset = (packetsStep - 1) * FRAGMENT_SIZE;
    const chunk = body.slice(0, Math.min(body.length, FRAGMENT_SIZE));
    chunk.copy(state.data, offset);
    state.receivedSteps.add(packetsStep);

    // Not yet complete — wait for remaining fragments
    if (state.receivedSteps.size < packetsCount) return;

    // All fragments received — take the assembled buffer and clear the slot
    const assembled = Buffer.from(state.data);
    this.fragmentBuffers.delete(ip);

    // --- Step 4: checksum validation + dispatch (Fix #6) ---
    // assembled = StructHeader(10) + body + checksum(3)
    if (assembled.length < 13) return;
    if (assembled[0] !== 0x55) return;

    const innerFrame = assembled.slice(0, assembled.length - 3);
    const expectedChk = calcCheckCode(innerFrame);
    if (expectedChk[1] !== assembled[assembled.length - 2]) return;
    if (expectedChk[2] !== assembled[assembled.length - 1]) return;

    // Strip StructHeader and checksum → pure body
    const fc = assembled[1];
    const body2 = assembled.slice(10, assembled.length - 3);

    this._dispatchFC(fc, body2, ip, machineMode, assembled);
  }

  // -------------------------------------------------------------------------
  // Fix #1 — ACK sender (mirrors setReceiveData: data_state=1, send back)
  // The device expects exactly the original NetworkData header echoed back
  // with data_state flipped to 1 as the handshake acknowledgement.
  // -------------------------------------------------------------------------
  private _sendAck(ip: string, originalPacket: Buffer): void {
    if (!this.socket) return;
    try {
      // Build a 10-byte ACK: copy original NetworkData, flip data_state to 1
      const ack = Buffer.from(originalPacket.slice(0, 10));
      ack[8] = 1; // data_state = 1 (ACK)
      this.socket.send(ack, 0, ack.length, AMP_PORT, ip);
    } catch {
      /* ignore */
    }
  }

  // -------------------------------------------------------------------------
  // Dispatch assembled, validated frame by function_code
  // (mirrors NoClientDataSet / ClientDataSet switch in the original)
  // -------------------------------------------------------------------------
  private _dispatchFC(
    fc: number,
    body: Buffer,
    ip: string,
    machineMode: number,
    rawAssembled: Buffer,
  ): void {
    switch (fc) {
      // FC=0 BASIC_INFO — device replied to our discovery broadcast
      case FuncCode.BASIC_INFO: {
        // parseDiscoveryPacket needs the full raw packet with NetworkData header
        // re-prepend a synthetic NetworkData so offsets are correct
        const withNd = Buffer.concat([Buffer.alloc(10), rawAssembled]);
        const event = parseDiscoveryPacket(withNd, ip);
        if (!event) return;

        this.currentWindowMacs.add(event.mac);
        const isNew = !this.knownMacs.has(event.mac);
        this.knownMacs.set(event.mac, {
          ip,
          name: event.name,
          version: event.version,
        });

        if (isNew) {
          console.log(
            `[AmpController] Discovered: ${event.name} (${event.mac}) @ ${ip}`,
          );
        }
        this.emit("discovery", event satisfies DiscoveryEvent);
        break;
      }

      // FC=6 HEARTBEAT — device replied to our heartbeat unicast
      case FuncCode.HEARTBEAT: {
        // Reconstruct the full raw packet for parseHeartbeat (expects NetworkData prefix)
        const withNd = Buffer.concat([
          buildNetworkData(rawAssembled.length, machineMode),
          rawAssembled,
        ]);

        const mac = this._macFromIp(ip);
        if (!mac) {
          // IP not yet in knownMacs — trigger a discovery cycle to learn it
          this._sendDiscovery();
          return;
        }

        const heartbeat = parseHeartbeat(withNd);
        if (!heartbeat) return;

        // Fix #5 — update per-amp last-seen timestamp
        this.lastHeartbeatAt.set(mac, Date.now());

        const known = this.knownMacs.get(mac);
        this.emit("heartbeat", {
          ip,
          mac,
          name: known?.name ?? "",
          version: known?.version ?? "",
          heartbeat,
        } satisfies HeartbeatEvent);
        break;
      }

      default:
        // Other FCs (presets, vol, mute, …) will be handled by CvrAmpDevice
        // unicast methods on the same socket — ignore here.
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Refresh_Thread — queryT_V_A() equivalent
  //
  // Broadcast a single FC=6 heartbeat packet every 140ms.
  // All discovered amps reply simultaneously — poll rate is always 140ms
  // regardless of how many amps are on the network (2–20+).
  // -------------------------------------------------------------------------
  private _startHeartbeatLoop(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || !this.isRefresh) {
        this.heartbeatCount = 0;
        return;
      }

      // Broadcast — every amp on the network replies independently.
      try {
        this.socket.send(
          this.heartbeatPacket,
          0,
          this.heartbeatPacket.length,
          AMP_PORT,
          BROADCAST_ADDR,
        );
      } catch {
        /* ignore */
      }

      this.heartbeatCount++;

      // Every 25 ticks (~3.5 s) — run the connection watchdog
      if (this.heartbeatCount >= 25) {
        this.heartbeatCount = 0;
        this._judgeOnline();
      }
    }, HEARTBEAT_MS);
  }

  // -------------------------------------------------------------------------
  // TimerRefresh — refrash() timer + two-cycle offline detection (Fix #3)
  //
  // Original C# refresh_step logic:
  //   step++ → if step==1: clear list   → broadcast → sleep 1s → don't mark offline
  //   step++ → if step==2: don't clear  → broadcast → sleep 1s → DO mark offline → step=0
  //
  // For multi-amp: we check ALL knownMacs against currentWindowMacs.
  // -------------------------------------------------------------------------
  private _startDiscoveryTimer(): void {
    if (this.discoveryTimer) return;

    this.discoveryTimer = setInterval(() => {
      this._runDiscoveryCycle();
    }, DISCOVERY_MS);
  }

  private _runDiscoveryCycle(): void {
    this.refreshStep++;

    if (this.refreshStep === 1) {
      // First pass: clear the window list so we start fresh
      // (mirrors: if (refresh_step == 1) refresh_MacList.Clear())
      this.currentWindowMacs.clear();
    }

    // Broadcast and wait the discovery window
    this._sendDiscovery();

    setTimeout(() => {
      if (this.refreshStep < 2) {
        // First pass done — do not mark offline yet (grace period)
        return;
      }

      // Second pass: any knownMac that did not appear in either window is offline
      this.refreshStep = 0;

      this.knownMacs.forEach((_, mac) => {
        if (!this.currentWindowMacs.has(mac)) {
          console.log(`[AmpController] Offline (missed 2 cycles): ${mac}`);
          this.knownMacs.delete(mac);
          this.lastHeartbeatAt.delete(mac);
          this.emit("offline", { mac } satisfies OfflineEvent);
        }
      });
    }, DISCOVERY_WINDOW_MS);
  }

  private _sendDiscovery(): void {
    if (!this.socket) return;
    try {
      this.socket.send(
        this.discoveryPacket,
        0,
        this.discoveryPacket.length,
        AMP_PORT,
        BROADCAST_ADDR,
      );
    } catch (err) {
      console.error("[AmpController] _sendDiscovery error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // Fix #5 — judgeOnline(): per-amp heartbeat watchdog
  //
  // Called every 25 heartbeat ticks (~3.5 s).
  // For each known amp: if we haven't received a heartbeat from it within
  // HEARTBEAT_TIMEOUT_MS, emit an "offline" event immediately.
  // This catches amps that go silent without missing a discovery broadcast.
  // -------------------------------------------------------------------------
  private _judgeOnline(): void {
    const now = Date.now();
    this.knownMacs.forEach((_, mac) => {
      const last = this.lastHeartbeatAt.get(mac);
      if (last !== undefined && now - last > HEARTBEAT_TIMEOUT_MS) {
        console.log(
          `[AmpController] judgeOnline: ${mac} silent for ${now - last}ms → offline`,
        );
        this.knownMacs.delete(mac);
        this.lastHeartbeatAt.delete(mac);
        this.currentWindowMacs.delete(mac);
        this.emit("offline", { mac } satisfies OfflineEvent);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private _macFromIp(ip: string): string | null {
    for (const [mac, entry] of this.knownMacs) {
      if (entry.ip === ip) return mac;
    }
    return null;
  }

  /**
   * Public API for on-demand discovery (used by /api/scan route).
   *
   * Sends a broadcast FC=0 using the already-bound socket and collects
   * all "discovery" events received within `windowMs` milliseconds.
   * This avoids creating a second socket on port 45454.
   */
  public async triggerDiscovery(windowMs = 500): Promise<DiscoveryEvent[]> {
    // Wait for the socket to be bound before sending anything
    await this._socketReady;

    return new Promise((resolve) => {
      const found: Map<string, DiscoveryEvent> = new Map();

      const listener = (event: DiscoveryEvent) => {
        found.set(event.mac, event);
      };

      this.on("discovery", listener);
      this._sendDiscovery();

      setTimeout(() => {
        this.off("discovery", listener);
        resolve(Array.from(found.values()));
      }, windowMs);
    });
  }

  private _clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------
// Attached to globalThis so Next.js HMR hot reloads do not spawn a second
// socket — the same instance survives module re-evaluation.
declare global {
  // eslint-disable-next-line no-var
  var __ampController: AmpController | undefined;
}

if (!globalThis.__ampController) {
  globalThis.__ampController = new AmpController();
}

export const ampController: AmpController = globalThis.__ampController;
