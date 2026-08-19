import { io } from "socket.io-client";
const TOKEN = "6b5836a5461a5f14febc39423ed96ba05bc0703bcbe3a2bccc97078182066090";
const sock = io("https://api.suhhai.cn/realtime", {
  auth: { sessionKey: "cs-1787120211150-7ugevraa", token: TOKEN },
  transports: ["websocket", "polling"],
  reconnection: false,
});
const ts = () => new Date().toISOString();
sock.on("connect", () => console.log(`[${ts()}] CONNECTED sid=${sock.id}`));
sock.on("user_message", (p) => console.log(`[${ts()}] USER_MESSAGE:`, JSON.stringify(p)));
sock.on("connect_error", (e) => console.log(`[${ts()}] connect_error:`, e.message));
sock.on("disconnect", (r) => console.log(`[${ts()}] disconnect:`, r));
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
      messages: [{ id: "v066", role: "user", parts: [{ type: "text", text: "cs-round-066 实时性验证" }] }],
    }),
  });
  console.log(`[${ts()}] chat POST status=${res.status}`);
  await res.text();
}, 1000);
setTimeout(() => { console.log(`[exit]`); process.exit(0); }, 8000);
