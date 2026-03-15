import dgram, { RemoteInfo, Socket } from "dgram";
import { EventEmitter } from "events";
import os from "os";

export interface NetworkAdapterConfig {
  recvPort: number;
  sendPort: number;
}

export class NetworkAdapter extends EventEmitter {
  private started = false;
  private socket: Socket | null = null;
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

  async start(): Promise<void> {
    if (this.started) return;

    if (this.started) {
      await this.stop();
    }

    this.socket = dgram.createSocket("udp4");

    this.socket.on("message", (msg, rinfo) => this.emit("message", msg, rinfo));
    this.socket.on("error", (err) => {
      console.error("error in network adapter " + err);
      this.started = false;
      this.start();
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.socket?.removeListener("error", onError);
        reject(err);
      };

      this.socket!.once("error", onError);
      this.socket!.bind({ port: this.recvPort, exclusive: false }, () => {
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
    await this.start();
    this.socket!.setBroadcast(broadcast);

    return new Promise((resolve, reject) => {
      this.socket!.send(msg, offset, length, this.sendPort, address, (error: Error | null, bytes: number) => {
        if (error === null) resolve(bytes);
        else reject(error);
      });
    });
  }

  getNetworkInterfaces() {
    return os.networkInterfaces();
  }

  emit<K extends keyof NetworkEmitter>(event: K, ...args: NetworkEmitter[K]): boolean {
    return super.emit(event, ...args);
  }
  on<K extends keyof NetworkEmitter>(event: K, listener: (...args: NetworkEmitter[K]) => void): this {
    super.on(event, listener);
    return this;
  }
  once<K extends keyof NetworkEmitter>(event: K, listener: (...args: NetworkEmitter[K]) => void): this {
    super.once(event, listener);
    return this;
  }
  removeListener<K extends keyof NetworkEmitter>(event: K, listener: (...args: NetworkEmitter[K]) => void): this {
    super.removeListener(event, listener);
    return this;
  }
}

type NetworkEmitter = { message: [Buffer, RemoteInfo] };
