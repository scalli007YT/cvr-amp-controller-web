/**
 * GET /api/amp-events
 *
 * Server-Sent Events stream that bridges the server-side AmpController
 * singleton to the browser.
 *
 * The controller owns the UDP socket (bound once, persistent), runs the
 * 140 ms heartbeat loop and the 4 s discovery timer.  This route simply
 * subscribes to its EventEmitter and forwards events as SSE messages.
 *
 * Event types (JSON body of each `data:` line):
 *
 *   { type: "discovery", ip, mac, name, version }
 *   { type: "heartbeat", ip, mac, heartbeat: HeartbeatData }
 *   { type: "offline",   mac }
 *   { type: "ping" }          ← keepalive every 15 s
 */

import { ampController } from "@/lib/amp-controller";
import type {
  DiscoveryEvent,
  HeartbeatEvent,
  OfflineEvent,
} from "@/lib/amp-controller";

// Tell Next.js this route must not be statically pre-rendered
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  // Ensure the controller socket is started (idempotent)
  ampController.start();

  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: object) => {
        if (closed) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
        } catch {
          // Stream already closed — ignore
        }
      };

      // -----------------------------------------------------------------------
      // Attach listeners
      // -----------------------------------------------------------------------
      const onDiscovery = (e: DiscoveryEvent) =>
        send({ type: "discovery", ...e });

      const onHeartbeat = (e: HeartbeatEvent) =>
        send({ type: "heartbeat", ...e });

      const onOffline = (e: OfflineEvent) => send({ type: "offline", ...e });

      ampController.on("discovery", onDiscovery);
      ampController.on("heartbeat", onHeartbeat);
      ampController.on("offline", onOffline);

      // Keepalive ping every 15 s to prevent proxy/browser timeouts
      const pingTimer = setInterval(() => send({ type: "ping" }), 15_000);

      // -----------------------------------------------------------------------
      // Cleanup on client disconnect
      // -----------------------------------------------------------------------
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pingTimer);
        ampController.off("discovery", onDiscovery);
        ampController.off("heartbeat", onHeartbeat);
        ampController.off("offline", onOffline);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // ReadableStream cancel() is called when the client disconnects
      // We store cleanup on the controller object keyed by a Symbol so
      // the cancel callback below can reach it.
      (controller as unknown as { _cleanup: () => void })._cleanup = cleanup;
    },

    cancel() {
      // Called by the runtime when the client disconnects
      const ctrl = this as unknown as { _cleanup?: () => void };
      ctrl._cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
