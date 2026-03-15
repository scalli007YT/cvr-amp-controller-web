import dgram, { RemoteInfo, Socket } from "dgram";
import { EventEmitter } from "events";

export interface NetworkAdapterConfig {
  recvPort: number;
  sendPort: number;
}

export class NetworkAdapter extends EventEmitter {
  private started = false;
  private socket: Socket | null = null;
  private bindAddress = "0.0.0.0";
  private readonly recvPort: number;
  private readonly sendPort: number;

  constructor(config: NetworkAdapterConfig) {
    super();
    this.recvPort = config.recvPort;
    this.sendPort = config.sendPort;
  }

  get isStarted(): boolean {
    return this.started;
  }

  async start(bindAddress = "0.0.0.0"): Promise<void> {
    if (this.started && this.bindAddress === bindAddress) return;

    if (this.started) {
      await this.stop();
    }

    this.bindAddress = bindAddress;
    this.socket = dgram.createSocket("udp4");

    this.socket.on("message", (msg, rinfo) => this.emit("message", msg, rinfo));
    this.socket.on("error", (err) => {
      this.started = false;
      this.emit("error", err);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.socket?.removeListener("error", onError);
        reject(err);
      };

      this.socket!.once("error", onError);
      this.socket!.bind({ port: this.recvPort, address: bindAddress, exclusive: false }, () => {
        this.socket?.removeListener("error", onError);
        this.socket?.setBroadcast(true);
        this.started = true;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.socket) {
      this.started = false;
      return;
    }

    const socket = this.socket;
    this.socket = null;

    await new Promise<void>((resolve) => {
      socket.close(() => resolve());
    });

    this.started = false;
  }

  async send(
    msg: NodeJS.ArrayBufferView,
    offset: number,
    length: number,
    address: string,
    broadcast: boolean
  ): Promise<number> {
    if (!this.started || !this.socket) {
      throw new Error("NetworkAdapter is not started");
    }

    this.socket.setBroadcast(broadcast);

    return new Promise((resolve, reject) => {
      this.socket!.send(msg, offset, length, this.sendPort, address, (error: Error | null, bytes: number) => {
        if (error === null) resolve(bytes);
        else reject(error);
      });
    });
  }

  emit(event: "message", ...args: [Buffer, RemoteInfo]): boolean;
  emit(event: "error", ...args: [Error]): boolean;
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: "message", listener: (msg: Buffer, rinfo: RemoteInfo) => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    super.on(event, listener);
    return this;
  }

  once(event: "message", listener: (msg: Buffer, rinfo: RemoteInfo) => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: string, listener: (...args: any[]) => void): this {
    super.once(event, listener);
    return this;
  }

  removeListener(event: "message", listener: (msg: Buffer, rinfo: RemoteInfo) => void): this;
  removeListener(event: "error", listener: (err: Error) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this {
    super.removeListener(event, listener);
    return this;
  }
}
