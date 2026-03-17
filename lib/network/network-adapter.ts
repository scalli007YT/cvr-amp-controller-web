import { RemoteInfo } from "dgram";
import { NetworkSocket } from "@/lib/network/network-socket";
import { TypedEventEmitter } from "@/lib/utils";
import {
  UdpFragmentReassembler,
  buildAckPacket,
  buildProtocolPacket,
  decodeAssembledFrame,
  parseNetworkDataHeader,
  type AssembledFrame,
  type NetworkDataHeader,
  type ProtocolPacketParams
} from "./protocol";

type NetworkAdapterEvents = {
  message: [Buffer, RemoteInfo];
  error: [Error];
};

export class NetworkAdapter extends TypedEventEmitter<NetworkAdapterEvents> {
  private readonly networkSocket = new NetworkSocket(45454, 45455);
  private readonly reassembler = new UdpFragmentReassembler();

  constructor() {
    super();
    this.networkSocket.on("message", (msg, rinfo) => this.onReceivePacket(msg, rinfo));
    this.networkSocket.on("error", (err) => this.emit("error", err));
  }

  get isStarted(): boolean {
    return this.networkSocket.isStarted;
  }

  async start(bindAddress = "0.0.0.0"): Promise<void> {
    await this.networkSocket.start(bindAddress);
  }

  async stop(): Promise<void> {
    await this.networkSocket.stop();
  }

  async send(
    msg: NodeJS.ArrayBufferView,
    offset: number,
    length: number,
    address: string,
    broadcast: boolean
  ): Promise<number> {
    return this.sendRaw_shouldBeReplacedWithSendPacket(msg, offset, length, address, broadcast);
  }

  /**
   * @deprecated Use sendPacket instead.
   */
  async sendRaw_shouldBeReplacedWithSendPacket(
    msg: NodeJS.ArrayBufferView,
    offset: number,
    length: number,
    address: string,
    broadcast: boolean
  ): Promise<number> {
    return this.networkSocket.send(msg, offset, length, address, broadcast);
  }

  async getNetworkInterfaces() {
    return this.networkSocket.getNetworkInterfaces();
  }

  buildProtocolPacket(params: ProtocolPacketParams): Buffer {
    return buildProtocolPacket(params);
  }

  parseNetworkData(raw: Buffer): NetworkDataHeader | null {
    return parseNetworkDataHeader(raw);
  }

  buildAck(rawPacket: Buffer): Buffer | null {
    return buildAckPacket(rawPacket);
  }

  pushFragment(ip: string, rawPacket: Buffer): Buffer | null {
    return this.reassembler.push(ip, rawPacket);
  }

  decodeAssembled(assembled: Buffer): AssembledFrame | null {
    return decodeAssembledFrame(assembled);
  }

  clearFragments(ip?: string): void {
    this.reassembler.clear(ip);
  }

  /**
   * @todo implement structured packet sending.
   */
  async sendPacket(packet: object, address: string): Promise<void> {
    void packet;
    void address;
  }

  /**
   * @todo implement structured broadcast sending.
   */
  async broadcastPacket(packet: object): Promise<void> {
    void packet;
  }

  private onReceivePacket(buffer: Buffer, rinfo: RemoteInfo): void {
    this.emit("message", buffer, rinfo);
  }
}
