import { io } from "socket.io-client";
const TOKEN = "6b5836a5461a5f14febc39423ed96ba05bc0703bcbe3a2bccc97078182066090";

// 测试 1:连 /realtime URL path(像 ai-cs-demo 那样)
const sock1 = io("https://api.suhhai.cn/realtime", {
  auth: { sessionKey: "cs-1787120211150-7ugevraa", token: TOKEN },
  transports: ["websocket", "polling"],
  reconnection: false,
});
sock1.on("connect", () => console.log(`test1 /realtime: connected sid=${sock1.id} nsp=${sock1.nsp?.name}`));
sock1.on("connect_error", (e) => console.log(`test1 /realtime: connect_error: ${e.message}`));
sock1.on("ping", (...a) => console.log(`test1 received ping`, a));

// 测试 2:连根 namespace,后用 .of('/realtime')
const sock2 = io("https://api.suhhai.cn", {
  auth: { sessionKey: "cs-1787120211150-7ugevraa", token: TOKEN },
  transports: ["websocket", "polling"],
  reconnection: false,
});
sock2.on("connect", () => {
  console.log(`test2 / : connected sid=${sock2.id} nsp=${sock2.nsp?.name}`);
  // 尝试 .of('/realtime')
  const nsp = sock2.socket.of("/realtime");
  nsp.on("connect", () => console.log(`test2 /realtime via .of(): connected sid=${nsp.id}`));
  nsp.on("connect_error", (e) => console.log(`test2 /realtime via .of() connect_error: ${e.message}`));
});
sock2.on("connect_error", (e) => console.log(`test2 / : connect_error: ${e.message}`));

setTimeout(() => { console.log("exit"); process.exit(0); }, 8000);
