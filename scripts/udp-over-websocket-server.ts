import WebSocket, {WebSocketServer} from "ws";
import dgram, {BindOptions, Socket} from "dgram";

const wss = new WebSocketServer({ port: 8080 });
wss.on("connection", (ws: WebSocket) => {
   const udpSockets = new Map<number, Socket>();
   const listeners = new Map<number, (...args: any) => void>();

   ws.on("message", (e) => {
      const data = JSON.parse(e.toString()) as {type: "invocation", method: string, args: any[]} | {type: "request", requestId: number, method: string, args: any[]};

      console.log(data);

      if (data.type == "invocation") {
         switch (data.method) {
            case "constructor":
               udpSockets.set(data.args[0], dgram.createSocket("udp4"));
               console.log("created socket");
               break;
            case "on":
               const udpSocket = udpSockets.get(data.args[0])!;
               const listener = (...args: any) => ws.send(JSON.stringify({type: "event", eventListenerId: data.args[1], args: args}));
               listeners.set(data.args[1], listener);
               udpSocket.on(data.args[2], listener);
               console.log("added listener " + data.args[2]);
               break;
            case "close": {
               const udpSocket = udpSockets.get(data.args[0])!;
               udpSocket.close();
               console.log("close socket " + data.args[0]);
               break;
            }
            case "setBroadcast": {
               console.log("not implemented");
               break;
            }
            case "setMaxListeners": {
               console.log("not implemented");
               break;
            }
            case "removeListener": {
               console.log("not implemented");
               break;
            }
         }
      } else if (data.type == "request") {
         switch (data.method) {
            case "bind":
               const udpSocket = udpSockets.get(data.args[0])!;
               udpSocket.bind(data.args[1] as BindOptions, () => ws.send(JSON.stringify({type: "response", requestId: data.requestId, args: []})));
               console.log("socket bound");
               break;
            case "send": {
               const udpSocket = udpSockets.get(data.args[0])!;
               udpSocket.send(Buffer.from(data.args[1].data), data.args[1], data.args[3], data.args[4], data.args[5]);
               console.log("send");
               break;
            }
            case "getNetworkInterfaces": {
               console.log("getNetworkInterfaces not implemented");
               break;
            }
         }
      }
   });
});
