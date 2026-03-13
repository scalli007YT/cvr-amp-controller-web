import dgram, { RemoteInfo, Socket } from "dgram";
import { EventEmitter } from "events";

const AMP_PORT = 45455;
const PC_RECV_PORT = 45454;
class NetworkAdapter extends EventEmitter {
  private started = false;
  private socket: Socket;

  constructor() {
    super();
  }

  async start() {
    if (this.started) return;
    this.started = true;

    this.socket = dgram.createSocket("udp4");
    this.socket.on("message", (msg, rinfo) => this.emit("message", msg, rinfo));
    this.socket.on("error", async (err) => {
      console.error("error at udp socket:", err);
      await new Promise((res) => setTimeout(res, 100));
      this.started = false;
      this.start();
    });
    await new Promise((res) => this.socket.bind({ port: PC_RECV_PORT, exclusive: false }, () => res()));
  }

  async send(msg: NodeJS.ArrayBufferView, offset: number, length: number, address: string, broadcast: boolean) {
    await this.start();
    this.socket.setBroadcast(broadcast);
    return new Promise((resolve, reject) => {
      this.socket.send(msg, offset, length, AMP_PORT, address, (error: Error | null, bytes: number) => {
        if (error === null) resolve(bytes);
        else reject(error, bytes);
      });
    });
  }

  emit(event: "message", ...args: [Buffer, RemoteInfo]): boolean {
    return super.emit(event, ...args);
  }
  on(event: "message", listener: (msg: Buffer, rinfo: RemoteInfo) => void): this {
    super.on(event, listener);
    return this;
  }
  once(event: "message", listener: (msg: Buffer, rinfo: RemoteInfo) => void): this {
    super.once(event, listener);
    return this;
  }
  removeListener(event: "message", listener: (msg: Buffer, rinfo: RemoteInfo) => void): this {
    super.removeListener(event, listener);
    return this;
  }
}

export const networkAdapter = new NetworkAdapter();
