import dgram from "dgram";
import { FuncCode } from "./amp-device";

const BROADCAST_ADDR = "255.255.255.255";
const AMP_PORT = 45455;
const DISCOVERY_TIMEOUT = 1000; // 1 second timeout for broadcast discovery

/**
 * Broadcast-based discovery for AMP devices (matching original C# app)
 * Sends BASIC_INFO query to 255.255.255.255:45455 and collects responses
 * Much faster and simpler than ARP table lookup
 */
export async function broadcastDiscovery(): Promise<
  Array<{ ip: string; mac: string }>
> {
  const devices: Map<string, string> = new Map(); // MAC -> IP mapping
  const PC_RECV_PORT = 45454; // Port to listen for AMP responses

  return new Promise((resolve) => {
    try {
      const socket = dgram.createSocket("udp4");

      const timeoutHandle = setTimeout(() => {
        try {
          socket.close();
        } catch {}
        // Return collected devices
        const result = Array.from(devices.entries()).map(([mac, ip]) => ({
          ip,
          mac,
        }));
        resolve(result);
      }, DISCOVERY_TIMEOUT);

      socket.on("message", (msg: Buffer, rinfo) => {
        try {
          // Parse UDP response frame
          // Structure: [NetworkData 10] [StructHeader 10] [Body] [Checksum 3]
          if (msg.length < 20) return;

          const head = msg[10]; // StructHeader head
          if (head !== 0x55) return;

          const funcCode = msg[11]; // Function code
          if (funcCode !== FuncCode.BASIC_INFO) return;

          // Extract MAC address (at offset 84, 6 bytes)
          if (msg.length > 90) {
            const macBytes = msg.slice(84, 90);
            const sum = macBytes.reduce((a, b) => a + b, 0);
            if (sum > 0) {
              // Valid MAC (not all zeros)
              const mac = Array.from(macBytes)
                .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
                .join(":");

              // Track first occurrence of this MAC
              if (!devices.has(mac)) {
                devices.set(mac, rinfo.address);
              }
            }
          }
        } catch (err) {
          console.error("[DISCOVERY] Error parsing message:", err);
        }
      });

      socket.on("error", (err) => {
        console.error("[DISCOVERY] Socket error:", err);
        clearTimeout(timeoutHandle);
        try {
          socket.close();
        } catch {}
        const result = Array.from(devices.entries()).map(([mac, ip]) => ({
          ip,
          mac,
        }));
        resolve(result);
      });

      // Bind socket to receive port BEFORE sending
      socket.bind(
        { port: PC_RECV_PORT, address: "0.0.0.0", exclusive: false },
        () => {
          try {
            // Now that socket is bound, enable broadcast mode
            socket.setBroadcast(true);

            // Build BASIC_INFO broadcast query packet
            // Build StructHeader (10 bytes)
            const header = Buffer.alloc(10);
            header[0] = 0x55; // head
            header[1] = FuncCode.BASIC_INFO; // function_code
            header[2] = 2; // status_code (request)
            header[3] = 0; // chx
            header[4] = 0; // link
            header[5] = 0; // inOutFlag
            header[6] = 0; // segment
            header[7] = 0; // r1
            header[8] = 0; // r2
            header[9] = 0; // r3

            // Calculate checksum (3 bytes)
            const length = header.length;
            const num = length + 3;
            let sum = header.reduce((acc, byte) => acc + byte, 0);
            sum += num + (num >> 8);

            const checksum = Buffer.from([
              (num >> 8) & 0xff,
              num & 0xff,
              sum & 0xff,
            ]);

            const frame = Buffer.concat([header, checksum]);

            // Build NetworkData wrapper (10 bytes)
            const networkData = Buffer.alloc(10);
            networkData.writeUInt32LE(0x0000d903, 0); // data_flag
            networkData[4] = 1; // packets_count
            networkData.writeUInt16LE(frame.length, 5); // packets_lastlenth
            networkData[7] = 1; // packets_stepcount
            networkData[8] = 0; // data_state
            networkData[9] = 0; // machine_mode

            const packet = Buffer.concat([networkData, frame]);

            // Send broadcast discovery query
            socket.send(
              packet,
              0,
              packet.length,
              AMP_PORT,
              BROADCAST_ADDR,
              (err) => {
                if (err) {
                  clearTimeout(timeoutHandle);
                  try {
                    socket.close();
                  } catch {}
                  resolve([]);
                }
              },
            );
          } catch (err) {
            console.error("[DISCOVERY] Failed to build or send packet:", err);
            clearTimeout(timeoutHandle);
            try {
              socket.close();
            } catch {}
            resolve([]);
          }
        },
      );

      // Handle bind errors
      socket.on("error", (err) => {
        console.error("[DISCOVERY] Bind error:", err);
        clearTimeout(timeoutHandle);
        try {
          socket.close();
        } catch {}
        resolve([]);
      });
    } catch (err) {
      console.error("[DISCOVERY] Failed to create socket:", err);
      resolve([]);
    }
  });
}

/**
 * Stub for compatibility - kept for backward compatibility
 * Use broadcastDiscovery() instead
 */
export async function scanActiveIps(subnet: string): Promise<string[]> {
  const devices = await broadcastDiscovery();
  return devices.map((d) => d.ip);
}
