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

import { EventEmitter } from "events";
import { FuncCode, parseHeartbeat } from "./amp-device";
import type { BridgeReadback, HeartbeatData } from "@/stores/AmpStore";
import { NetworkAdapter } from "@/lib/network/network-adapter";
import { prependNetworkHeaderToAssembled } from "@/lib/network/protocol";

// ---------------------------------------------------------------------------
// Constants — matching original C# values exactly
// ---------------------------------------------------------------------------
const BROADCAST_ADDR = "255.255.255.255";
const HEARTBEAT_MS = 140; // queryT_V_A Thread.Sleep(140)
const DISCOVERY_MS = 4000; // TimerRefresh.Interval = 4000
const DISCOVERY_WINDOW_MS = 1000; // MainWindow.Sleep(1000) after broadcast
const DISCOVERY_PROBE_WINDOW_MS = 220; // initUDP2-style quick per-NIC probe
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
  basicInfo: BasicInfoSnapshot;
}

export interface BasicInfoSnapshot {
  Gain_max: number;
  Analog_signal_Input_chx: number;
  Digital_signal_input_chx: number;
  Output_chx: number;
  Machine_state: number;
}

export interface HeartbeatEvent {
  ip: string;
  mac: string;
  name: string;
  version: string;
  heartbeat: HeartbeatData;
  bridgePairs?: BridgeReadback[];
}

export interface OfflineEvent {
  mac: string;
}

async function getDirectedBroadcasts(): Promise<string[]> {
  const broadcasts: string[] = [];
  for (const iface of Object.values(await ampController.network.getNetworkInterfaces())) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      const ip = addr.address.split(".").map(Number);
      const mask = addr.netmask.split(".").map(Number);
      const bcast = ip.map((b, i) => (b & mask[i]) | (~mask[i] & 0xff));
      broadcasts.push(bcast.join("."));
    }
  }
  // Keep limited broadcast as fallback for edge setups.
  const unique = new Set(broadcasts);
  unique.add(BROADCAST_ADDR);
  return Array.from(unique);
}

async function getLocalBindCandidates(): Promise<string[]> {
  const out: string[] = [];
  for (const iface of Object.values(await ampController.network.getNetworkInterfaces())) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      out.push(addr.address);
    }
  }
  const unique = Array.from(new Set(out));
  unique.push("0.0.0.0");
  return Array.from(new Set(unique));
}

// ---------------------------------------------------------------------------
// Discovery parser — FC=0 BASIC_INFO response.
//
// FC=0 body variants seen in the original software:
//   75 bytes: Basic_information struct
//   79 bytes: Basic_information + 4-byte extension (vendor/meta)
//
// This parser accepts both. For 79-byte bodies, it trims to the first 75 bytes.
// ---------------------------------------------------------------------------
function parseDiscoveryPacket(raw: Buffer, ip: string): DiscoveryEvent | null {
  // Minimum valid FC=0 packet: NetworkData(10) + StructHeader(10) + body75 + checksum(3)
  if (raw.length < 98) return null;
  if (raw[10] !== 0x55) return null;
  if (raw[11] !== FuncCode.BASIC_INFO) return null;

  const fullBody = raw.slice(20, raw.length - 3);
  let body = fullBody;

  if (fullBody.length === 79) {
    body = fullBody.slice(0, 75);
  } else if (fullBody.length !== 75) {
    return null;
  }

  const macBytes = body.slice(64, 70);
  if (macBytes.reduce((a, b) => a + b, 0) === 0) return null;

  const mac = Array.from(macBytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(":");

  const verSlice = body.slice(0, 24);
  const verNull = verSlice.indexOf(0);
  const version = verSlice
    .slice(0, verNull === -1 ? 24 : verNull)
    .toString("ascii")
    .trim();

  const nameSlice = body.slice(32, 56);
  const nameNull = nameSlice.indexOf(0);
  const name = nameSlice
    .slice(0, nameNull === -1 ? 24 : nameNull)
    .toString("ascii")
    .trim();

  // Basic_information struct tail bytes.
  const gainMax = body[70] ?? 0;
  const analogSignalInputChx = body[71] ?? 0;
  const digitalSignalInputChx = body[72] ?? 0;
  const outputChx = body[73] ?? 0;
  const machineState = body[74] ?? 0;

  const basicInfo: BasicInfoSnapshot = {
    Gain_max: gainMax,
    Analog_signal_Input_chx: analogSignalInputChx,
    Digital_signal_input_chx: digitalSignalInputChx,
    Output_chx: outputChx,
    Machine_state: machineState
  };

  return { ip, mac, name, version, basicInfo };
}

// ---------------------------------------------------------------------------
// AmpController
// ---------------------------------------------------------------------------
class AmpController extends EventEmitter {
  readonly network = new NetworkAdapter();
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
  private knownMacs = new Map<string, { ip: string; name: string; version: string; basicInfo: BasicInfoSnapshot }>(); // mac → { ip, name, version, basicInfo }

  // Fix #5 — per-amp last-heartbeat timestamp for judgeOnline watchdog
  private lastHeartbeatAt = new Map<string, number>(); // mac → ms timestamp

  /** isRefresh gate (mirrors UDP.isRefresh = false during send()) */
  private isRefresh = true;

  /** Heartbeat tick counter — triggers judgeOnline every 25 ticks */
  private heartbeatCount = 0;

  private running = false;
  private bindingInProgress = false;
  private boundAddress = "0.0.0.0";
  private controlTargetIp: string | null = null;

  private readonly pendingFc27ByIp = new Map<
    string,
    {
      frames: Buffer[];
      timeout: ReturnType<typeof setTimeout>;
      settleTimer: ReturnType<typeof setTimeout> | null;
      resolve: (value: Buffer) => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly fc27QueueByIp = new Map<string, Promise<Buffer>>();
  private readonly bridgePairsByMac = new Map<string, BridgeReadback[]>();
  private bridgePollTick = 0;

  // Promise that resolves once the UDP socket is successfully bound.
  // triggerDiscovery awaits this so it never fires into a null socket.
  private _socketReadyResolve: (() => void) | null = null;
  private _socketReady: Promise<void> = new Promise((res) => (this._socketReadyResolve = res));

  // Pre-built query packets (re-used every tick, immutable)
  private readonly heartbeatPacket = this.network.buildProtocolPacket({
    functionCode: FuncCode.HEARTBEAT,
    statusCode: 2,
    chx: 0
  });
  private readonly discoveryPacket = this.network.buildProtocolPacket({
    functionCode: FuncCode.BASIC_INFO,
    statusCode: 2,
    chx: 0
  });

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  constructor() {
    super();
    this.network.on("message", (msg, rinfo) => {
      this._onPacket(msg, rinfo.address);
    });
    this.network.on("error", (err) => {
      this._handleNetworkError(err);
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Reset the ready promise for a fresh bind cycle
    this._socketReady = new Promise((res) => (this._socketReadyResolve = res));
    void this._bindAndStart();
  }

  stop(): void {
    this.running = false;
    this._clearTimers();
    void this.network.stop();
  }

  /** Pause heartbeat loop during a user command (mirrors isRefresh = false) */
  pauseHeartbeat(): void {
    this.isRefresh = false;
  }
  /** Resume heartbeat loop after a user command (mirrors isRefresh = true) */
  resumeHeartbeat(): void {
    this.isRefresh = true;
  }

  /**
   * Enter focused control mode for one amp (original setSendIP + setIsBroadcast(false)).
   * Heartbeat becomes unicast and periodic discovery timer is paused.
   */
  setControlTargetIp(ip: string | null): void {
    this.controlTargetIp = ip && ip.trim().length > 0 ? ip.trim() : null;

    if (this.controlTargetIp) {
      if (this.discoveryTimer) {
        clearInterval(this.discoveryTimer);
        this.discoveryTimer = null;
      }
      return;
    }

    if (this.running) {
      this._startDiscoveryTimer();
    }
  }

  /**
   * Fire-and-forget command via the shared persistent socket.
   *
   * Uses the same socket that receives heartbeats — no ephemeral port needed.
   * The amp will ACK back (data_state=1) which we already ignore in _onPacket.
   *
   * @param ip         Target amp IP
   * @param fc         Function code (e.g. FuncCode.MUTE = 10)
   * @param chx        Channel index 0–3
   * @param body       Command payload bytes
   * @param inOutFlag  StructHeader byte 5: 0=input, 1=output (default 0)
   */
  sendCommand(ip: string, fc: number, chx: number, body: Buffer, inOutFlag = 0): void {
    if (!this.network.isStarted) {
      console.warn("[AmpController] sendCommand: socket not ready");
      return;
    }
    try {
      const packet = this.network.buildProtocolPacket({
        functionCode: fc,
        statusCode: 3,
        chx,
        body,
        segment: 0,
        link: 0,
        inOutFlag
      });
      void this.network.sendRaw_shouldBeReplacedWithSendPacket(packet, 0, packet.length, ip, false).catch((err) => {
        console.error("[AmpController] sendCommand send error:", err);
      });
    } catch (err) {
      console.error("[AmpController] sendCommand error:", err);
    }
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

    if (!this.network.isStarted) {
      throw new Error("Socket not initialized");
    }

    const previous = this.fc27QueueByIp.get(ip) ?? Promise.resolve(Buffer.alloc(0));
    const queued = previous.catch(() => Buffer.alloc(0)).then(() => this._sendAndAwaitFC27(ip, channel));

    this.fc27QueueByIp.set(ip, queued);

    return queued.finally(() => {
      if (this.fc27QueueByIp.get(ip) === queued) {
        this.fc27QueueByIp.delete(ip);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Socket bootstrap — initUDP2-style NIC fallback probing
  // -------------------------------------------------------------------------
  private async _bindAndStart(): Promise<void> {
    if (this.bindingInProgress || !this.running) return;
    this.bindingInProgress = true;
    this._clearTimers();

    const candidates = await getLocalBindCandidates();
    let chosenAddress: string | null = null;

    try {
      for (let i = 0; i < candidates.length && this.running; i++) {
        const bindAddress = candidates[i];
        try {
          await this.network.start(bindAddress);
        } catch (err) {
          continue;
        }

        const found = await this._probeDiscoveryWindow();
        const isLast = i === candidates.length - 1;

        if (found || isLast) {
          chosenAddress = bindAddress;
          console.log(`[AmpController] Socket bound on ${bindAddress}:45454 — starting loops`);
          break;
        }
      }

      if (!this.running || !chosenAddress) return;
      this.boundAddress = chosenAddress;

      // Resolve the ready promise so triggerDiscovery() can proceed
      this._socketReadyResolve?.();
      this._socketReadyResolve = null;

      this._startHeartbeatLoop();
      this._startDiscoveryTimer();
    } finally {
      this.bindingInProgress = false;
    }
  }

  private _probeDiscoveryWindow(): Promise<boolean> {
    return new Promise((resolve) => {
      let seen = false;
      const listener = () => {
        seen = true;
      };

      this.on("discovery", listener);
      this._sendDiscovery();

      setTimeout(() => {
        this.off("discovery", listener);
        resolve(seen);
      }, DISCOVERY_PROBE_WINDOW_MS);
    });
  }

  private _handleNetworkError(err: Error): void {
    console.error("[AmpController] Socket error:", err.message);
    this._clearTimers();
    setTimeout(() => {
      if (this.running) void this._bindAndStart();
    }, 500);
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
    const nd = this.network.parseNetworkData(raw);
    if (!nd) return;

    // data_state=1 means this is an ACK we sent ourselves, reflected back — ignore
    if (nd.dataState === 1) return;

    // --- Step 2: ACK back to sender (Fix #1) ---
    // mirrors: networkData.data_state = 1; UDP_Receive.Send(SendData, ..., ACK_IP)
    // We echo the NetworkData header with data_state=1, no body.
    this._sendAck(ip, raw);

    const assembled = this.network.pushFragment(ip, raw);
    if (!assembled) return;

    const decoded = this.network.decodeAssembled(assembled);
    if (!decoded) return;

    this._dispatchFC(decoded.functionCode, decoded.body, ip, nd.machineMode, decoded.rawAssembled);
  }

  // -------------------------------------------------------------------------
  // Fix #1 — ACK sender (mirrors setReceiveData: data_state=1, send back)
  // The device expects exactly the original NetworkData header echoed back
  // with data_state flipped to 1 as the handshake acknowledgement.
  // -------------------------------------------------------------------------
  private _sendAck(ip: string, originalPacket: Buffer): void {
    const ack = this.network.buildAck(originalPacket);
    if (!ack) return;
    void this.network.sendRaw_shouldBeReplacedWithSendPacket(ack, 0, ack.length, ip, false).catch(() => {
      /* ignore */
    });
  }

  // -------------------------------------------------------------------------
  // Dispatch assembled, validated frame by function_code
  // (mirrors NoClientDataSet / ClientDataSet switch in the original)
  // -------------------------------------------------------------------------
  private _dispatchFC(fc: number, body: Buffer, ip: string, machineMode: number, rawAssembled: Buffer): void {
    switch (fc) {
      // FC=0 BASIC_INFO — device replied to our discovery broadcast
      case FuncCode.BASIC_INFO: {
        // parseDiscoveryPacket needs the full raw packet with NetworkData header
        // re-prepend a synthetic NetworkData so offsets are correct
        const withNd = prependNetworkHeaderToAssembled(rawAssembled, machineMode);
        const event = parseDiscoveryPacket(withNd, ip);
        if (!event) return;

        this.currentWindowMacs.add(event.mac);
        const isNew = !this.knownMacs.has(event.mac);
        this.knownMacs.set(event.mac, {
          ip,
          name: event.name,
          version: event.version,
          basicInfo: event.basicInfo
        });

        if (isNew) {
          console.log(`[AmpController] Discovered: ${event.name} (${event.mac}) @ ${ip}`);
        }
        this.emit("discovery", event satisfies DiscoveryEvent);
        break;
      }

      // FC=6 HEARTBEAT — device replied to our heartbeat unicast
      case FuncCode.HEARTBEAT: {
        // Reconstruct the full raw packet for parseHeartbeat (expects NetworkData prefix)
        const withNd = prependNetworkHeaderToAssembled(rawAssembled, machineMode);

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
          bridgePairs: this.bridgePairsByMac.get(mac)
        } satisfies HeartbeatEvent);
        break;
      }

      case FuncCode.BRIDGE: {
        const mac = this._macFromIp(ip);
        if (!mac) break;

        const pair = rawAssembled[3];
        if (pair !== 0 && pair !== 1) break;

        const raw = body.length > 0 ? body[0] : null;
        const current = this.bridgePairsByMac.get(mac) ?? [
          { pair: 0, raw: null, bridged: null },
          { pair: 1, raw: null, bridged: null }
        ];

        const next = current.map((entry) =>
          entry.pair === pair
            ? {
                pair: entry.pair,
                raw,
                bridged: raw === null ? null : raw === 0
              }
            : entry
        );

        this.bridgePairsByMac.set(mac, next);
        break;
      }

      case FuncCode.SYNC_DATA: {
        const pending = this.pendingFc27ByIp.get(ip);
        if (!pending) break;

        pending.frames.push(Buffer.from(body));
        if (pending.settleTimer) {
          clearTimeout(pending.settleTimer);
        }

        pending.settleTimer = setTimeout(() => {
          if (pending.settleTimer) clearTimeout(pending.settleTimer);
          clearTimeout(pending.timeout);
          this.pendingFc27ByIp.delete(ip);
          pending.resolve(Buffer.concat(pending.frames));
        }, 100);
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
      if (!this.network.isStarted || !this.isRefresh) {
        this.heartbeatCount = 0;
        return;
      }

      if (this.controlTargetIp) {
        // Focused control mode: unicast heartbeat to selected amp.
        void this.network
          .sendRaw_shouldBeReplacedWithSendPacket(
            this.heartbeatPacket,
            0,
            this.heartbeatPacket.length,
            this.controlTargetIp,
            false
          )
          .catch(() => {
            /* ignore */
          });
      } else {
        // Default mode: broadcast heartbeat to all amps.
        void this.network
          .sendRaw_shouldBeReplacedWithSendPacket(
            this.heartbeatPacket,
            0,
            this.heartbeatPacket.length,
            BROADCAST_ADDR,
            true
          )
          .catch(() => {
            /* ignore */
          });
      }

      this.heartbeatCount++;
      this.bridgePollTick++;

      // Every 25 ticks (~3.5 s) — run the connection watchdog
      if (this.heartbeatCount >= 25) {
        this.heartbeatCount = 0;
        this._judgeOnline();
      }

      if (this.bridgePollTick >= 5) {
        this.bridgePollTick = 0;
        this._pollBridgePairs();
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
          this.bridgePairsByMac.delete(mac);
          this.emit("offline", { mac } satisfies OfflineEvent);
        }
      });
    }, DISCOVERY_WINDOW_MS);
  }

  private async _sendDiscovery(): Promise<void> {
    if (!this.network.isStarted) return;
    for (const target of await getDirectedBroadcasts()) {
      void this.network
        .sendRaw_shouldBeReplacedWithSendPacket(this.discoveryPacket, 0, this.discoveryPacket.length, target, true)
        .catch((err) => {
          console.error("[AmpController] _sendDiscovery error:", err);
        });
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
        console.log(`[AmpController] judgeOnline: ${mac} silent for ${now - last}ms → offline`);
        this.knownMacs.delete(mac);
        this.lastHeartbeatAt.delete(mac);
        this.currentWindowMacs.delete(mac);
        this.bridgePairsByMac.delete(mac);
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

  private _pollBridgePairs(): void {
    if (!this.network.isStarted || !this.isRefresh) return;

    const targetIps = this.controlTargetIp
      ? [this.controlTargetIp]
      : Array.from(this.knownMacs.values()).map((entry) => entry.ip);

    for (const ip of targetIps) {
      for (const pair of [0, 1] as const) {
        const packet = this.network.buildProtocolPacket({
          functionCode: FuncCode.BRIDGE,
          statusCode: 2,
          chx: pair
        });

        void this.network.sendRaw_shouldBeReplacedWithSendPacket(packet, 0, packet.length, ip, false).catch(() => {
          /* ignore */
        });
      }
    }
  }

  private _sendAndAwaitFC27(ip: string, channel: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingFc27ByIp.get(ip);
        if (pending) {
          if (pending.settleTimer) clearTimeout(pending.settleTimer);
          this.pendingFc27ByIp.delete(ip);
        }
        reject(new Error(`FC=27 request for ${ip}:${channel} timed out`));
      }, 5000);

      this.pendingFc27ByIp.set(ip, {
        frames: [],
        timeout,
        settleTimer: null,
        resolve,
        reject
      });

      const packet = this.network.buildProtocolPacket({
        functionCode: FuncCode.SYNC_DATA,
        statusCode: 2,
        chx: channel
      });

      void this.network.sendRaw_shouldBeReplacedWithSendPacket(packet, 0, packet.length, ip, false).catch((err) => {
        const pending = this.pendingFc27ByIp.get(ip);
        if (pending) {
          clearTimeout(pending.timeout);
          if (pending.settleTimer) clearTimeout(pending.settleTimer);
          this.pendingFc27ByIp.delete(ip);
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
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
  var __ampController: AmpController | undefined;
}

if (!globalThis.__ampController) {
  globalThis.__ampController = new AmpController();
}

export const ampController: AmpController = globalThis.__ampController;
