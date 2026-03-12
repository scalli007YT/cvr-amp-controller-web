import dgram, {BindOptions, RemoteInfo} from "dgram";
import os, {NetworkInterfaceInfo} from "os";

export const udpAdapterType: "udp" | "udpOverWebsocket" = "udp";

export type DatagramSocket = {
    setBroadcast(b: boolean): void;
    setMaxListeners(n: number): void;
    close(): this;
    on(event: "close", listener: () => void): this;
    on(event: "connect", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "listening", listener: () => void): this;
    on(event: "message", listener: (msg: Buffer, rinfo: RemoteInfo) => void): this;
    send(
        msg: string | NodeJS.ArrayBufferView,
        offset: number,
        length: number,
        port?: number,
        address?: string,
        callback?: (error: Error | null, bytes: number) => void,
    ): void;
    removeListener(event: "close", listener: () => void): this;
    removeListener(event: "connect", listener: () => void): this;
    removeListener(event: "error", listener: (err: Error) => void): this;
    removeListener(event: "listening", listener: () => void): this;
    removeListener(event: "message", listener: (msg: Buffer, rinfo: RemoteInfo) => void): this;
    bind(options: BindOptions, callback?: () => void): this;
};
export type DatagramRemoteInfo = dgram.RemoteInfo;

let eventListenerCounter = 0;
const eventListeners = new Map<number, (...args: any) => void>();
let requestCounter = 0;
const requests = new Map<number, (...args: any) => void>();
let websocket: WebSocket | null = null;

setInterval(() => {
    if (udpAdapterType !== "udpOverWebsocket") return;
    if (websocket) return;

    websocket = new WebSocket("ws://localhost:8080");
    websocket.addEventListener("message", (e) => {
        const data = JSON.parse(e.data) as
            {type: "event", eventListenerId: number, args: any[]} |
            {type: "response", requestId: number, args: any[]};

        if (data.type == "event") {
            eventListeners.get(data.eventListenerId)?.(...data.args);
        } else if (data.type == "response") {
            requests.get(data.requestId)?.(...data.args);
            requests.delete(data.requestId);
        }
    });
    websocket.addEventListener("error", () => websocket = null);
    websocket.addEventListener("close", () => websocket = null);

    console.log("created new ws");
}, 500);


class UdpOverWSSocket implements DatagramSocket {

    private static idCounter = 0;
    private id = UdpOverWSSocket.idCounter++;

    bind(options: BindOptions, callback?: () => void): this {
        sendWebsocketRequest("bind", [this.id, options]).then((...args: any) => callback?.());
        return this;
    }

    close(): this {
        sendWebsocketInvoke("close", [this.id]);
        return this;
    }

    send(msg: string | NodeJS.ArrayBufferView, offset: number, length: number, port?: number, address?: string, callback?: (error: (Error | null), bytes: number) => void): void {
        sendWebsocketRequest("send", [this.id, msg, offset, length, port, address]).then((...args: any) => callback?.(...args));
    }

    setBroadcast(b: boolean): void {
        sendWebsocketInvoke("setBroadcast", [this.id, b]);
    }

    setMaxListeners(n: number): void {
        sendWebsocketInvoke("setMaxListeners", [this.id, n]);
    }

    on(event: string, listener: (...args: any) => void) {
        const eventListenerId = eventListenerCounter++;
        eventListeners.set(eventListenerId, listener);
        sendWebsocketInvoke("on", [this.id, eventListenerId, event]);
        return this;
    }

    removeListener(event: string, listener: (...args: any) => void) {
        const eventListenerId = [...eventListeners.entries()].find((e) => e[1] === listener)?.[0];
        if (eventListenerId === undefined) return this;

        eventListeners.delete(eventListenerId);
        sendWebsocketInvoke("removeListener", [this.id, eventListenerId, event]);
        return this;
    }
}

function sendWebsocketData(msg: string) {
    if (!websocket) {
        console.error("could not send over websocket");
        return;
    }

    websocket.send(msg);
}

function sendWebsocketInvoke(method: string, args: any[]) {
    sendWebsocketData(JSON.stringify({type: "invocation", method: method, args: args}));
}

async function sendWebsocketRequest(method: string, args: any[]) {
    return new Promise((res) => {
        const reqId = requestCounter++;
        requests.set(reqId, (...args: any) => res(...args));
        sendWebsocketData(JSON.stringify({type: "request", requestId: reqId, method: method, args: args}));
    });
}

export function createSocket(): DatagramSocket {
    if (udpAdapterType == "udpOverWebsocket")
        return new UdpOverWSSocket();

    return dgram.createSocket("udp4");
}

export async function getNetworkInterfaces() {
    if (udpAdapterType == "udpOverWebsocket")
        return await sendWebsocketRequest("getNetworkInterfaces", []) as Promise<NodeJS.Dict<NetworkInterfaceInfo[]>>;

    return os.networkInterfaces();
}
