import { io } from "socket.io-client";
const TOKEN = "6b5836a5461a5f14febc39423ed96ba05bc0703bcbe3a2bccc97078182066090";
const sock = io("https://api.suhhai.cn/realtime", {
  auth: { sessionKey: "cs-1787120211150-7ugevraa", token: TOKEN },
  transports: ["websocket", "polling"],
  reconnection: false,
});
const ts = () => new Date().toISOString();
sock.io.on("reconnect_attempt", () => console.log("reconnect"));
sock.on("connect", () => {
  console.log(`[${ts()}] CONNECTED sid=${sock.id} nsp=${sock.nsp.name}`);
  // 主动发 ping 测试
  setTimeout(async () => {
    console.log(`[${ts()}] sending ping`);
    sock.emit("ping", { hi: "test" }, (resp) => console.log(`[${ts()}] ping resp:`, JSON.stringify(resp)));
  }, 500);
});
sock.onAny((evt, ...args) => console.log(`[${ts()}] EVENT '${evt}':`, JSON.stringify(args).slice(0,200)));
sock.on("connect_error", (e) => console.log(`[${ts()}] connect_error:`, e.message));
setTimeout(async () => {
  console.log(`[${ts()}] triggering chat POST...`);
  const res = await fetch("https://chat.suhhai.cn/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": TOKEN },
    body: JSON.stringify({
      sessionKey: "cs-1787120211150-7ugevraa",
      visitorId: "64624a47-c4d9-49bc-b430-7a921eb74e2a",
      userId: 1,
      customerId: 1,
      topK: 3,
      messages: [{ id: "v066-debug", role: "user", parts: [{ type: "text", text: "cs-round-066 debug" }] }],
    }),
  });
  console.log(`[${ts()}] chat POST status=${res.status}`);
  await res.text();
}, 2000);
setTimeout(() => { console.log(`[exit]`); process.exit(0); }, 12000);
