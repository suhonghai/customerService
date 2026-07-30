# 客服 MCP 协议笔记(W9-10)

> 2026-06-12 Day 5 笔记
> 对应:`../scripts/mcp-servers/customer-service.ts` + `data/mock-orders.json`

## 1. 客服 MCP server 跟 W7-8 的区别

| 维度 | W7-8 local-dev-tools | W9-10 customer-service |
|---|---|---|
| 工具数 | 6(文件/git) | 4(客服专用) |
| Resource | 1 个 file:// 目录树 | 无(不需要) |
| 数据后端 | 真实文件系统 | cs_faq Chroma + mock-orders.json + 内存 Map |
| 安全 | `isPathSafe` 路径白名单 | `isOrderIdSafe` 订单号白名单 |
| 启停 | `pnpm mcp:dev` | `pnpm mcp:dev`(指向新 server) |

**4 工具设计**:

1. `search_faq` — 复用 `src/lib/rag.ts` 的 `search()`,底层是 cs_faq Chroma collection
2. `get_user_order` — 读 `data/mock-orders.json`(5 个 mock 订单)
3. `create_ticket` — 内存 Map,T-YYYYMMDDxxx 格式
4. `escalate_to_human` — 内存 Map,H-YYYYMMDDxxx 格式,5/15 分钟等待

**为什么不抽 Resource?** 客服场景没有"URI 寻址"需求,所有数据走工具调用更直接。

## 2. 一次完整会话的 JSON-RPC 消息

```
[CLIENT → SERVER]  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05",...}}
[SERVER → CLIENT]  {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"customer-service","version":"0.1.0"},"capabilities":{"tools":{}}}}
[CLIENT → SERVER]  {"jsonrpc":"2.0","method":"notifications/initialized"}
[CLIENT → SERVER]  {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_user_order","arguments":{"orderId":"#001"}}}
[SERVER → CLIENT]  {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"order\":{...}}"}]}}
```

错误场景(订单不存在):

```
[SERVER → CLIENT]  {"jsonrpc":"2.0","id":2,"result":{"isError":true,"content":[{"type":"text","text":"{\"error\":\"NOT_FOUND\",...}"}]}}
```

注意:`isError: true` 是工具结果的一部分,**不是** JSON-RPC 的 `error` 字段。
工具失败 → `result.isError: true`;协议失败 → 顶层 `error`。

## 3. search_faq vs chat/route.ts RAG 注入:不冲突

两个用法互补:

- **RAG 注入**:`chat/route.ts` 在调用 LLM 前**同步**把 top-K 检索结果塞进 system prompt
  - 好处:AI 一开始就看到资料,首条回复就有依据
  - 场景:用户问"如何申请退款",AI 直接看到 FAQ 内容
- **search_faq 工具**:AI **主动**调
  - 场景 1:AI 已经答了用户问题,但想确认细节 → 调 search_faq 二次检索
  - 场景 2:用户问题太泛,AI 觉得需要更多资料 → 调 search_faq
  - 场景 3:多轮对话,前面注入的资料不够用 → AI 在工具调用阶段再查

两者**底层共用** `src/lib/rag.ts` 的 `searchDocs()`,不重复实现 embedding 逻辑。
**注意**:客服 MCP server 在 `scripts/` 下跑,直接 import `../../src/lib/rag` 走 tsx 解析
(不要绕路 chromadb 客户端,容易跟 chat/route.ts 的 collection 不一致)。

## 4. 错误处理统一结构

5 类错误 → 5 种错误码:

| 错误码 | 触发场景 | AI 行为 |
|---|---|---|
| `INVALID_PARAMS` | Zod schema 失败(漏必填、类型错、纯空格) | 检查参数重试 |
| `UNSAFE_INPUT` | `isOrderIdSafe` 拒绝(路径穿越 / 格式错) | 修正输入 |
| `NOT_FOUND` | 订单不存在 / FAQ 库空 | 告诉用户「查不到」 |
| `INTERNAL` | embedding API 挂 / Chroma 挂 | 重试或 fallback |
| `TIMEOUT` | 工具超时(本次未实现,预留) | 重试 |

**FAQ 库空是 NOT_FOUND 不是 INTERNAL**:
库空 → search_faq 返 `{results: [], total: 0}`,**不 throw**。
这让 AI 走「资料里没找到,需要用户提供更多信息」分支,而不是报错崩溃。

## 5. 调试命令

### 5.1 协议层裸调试(curl 等价)

```bash
cd W9-10-customer-service/ai-cs-demo
pnpm mcp:dev <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
EOF
```

stdout 应看到 2 条 JSON-RPC 响应(server 启动日志走 stderr)。

### 5.2 跑协议层单测

```bash
# 前置(第一次):seed FAQ 库
pnpm tsx scripts/seed-faq.ts

# 跑 8+ case
bash scripts/test-cs-tools.sh
```

### 5.3 验证 search_faq 真能搜到东西

```bash
# 先 seed
pnpm tsx scripts/seed-faq.ts

# 然后启 dev server 测 chat/route.ts(需要 next dev 起来)
# 或直接用 MCP 协议层查
pnpm mcp:dev <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_faq","arguments":{"query":"如何申请退款"}}}
EOF
```

## 6. 跟 W7-8 共用 vs 独立的边界

**共用**(W7-8 → W9-10 沿用):
- `src/lib/rag.ts` 的 searchDocs / addDocument / getStoreSize(API 兼容)
- `isPathSafe` / `isOrderIdSafe` 的白名单思路
- 序列化 tool handler 的 promise 链
- JSON-RPC 协议 + McpServer SDK 用法

**独立**:
- Server 名(`customer-service` vs `local-dev-tools`)
- 工具集(客服 4 工具 vs 文件 6 工具)
- 数据存储(Chroma collection `cs_faq` + mock-orders.json + 内存 Map vs 真实文件系统)
- 安全模型(订单号白名单 vs 路径白名单)

**风险**:工单 / 转人工存内存,重启清空。plan 风险表已接受。Day 9 之前不接数据库。

## 7. Day 6 集成预告

`chat/route.ts` 会通过 `@ai-sdk/mcp` 的 `Experimental_StdioMCPTransport` 拉起这个 server:

```ts
import { createMCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'

const client = await createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: 'npx',
    args: ['tsx', 'scripts/mcp-servers/customer-service.ts'],
    env: { ...process.env },
  }),
})

// 跟 local tools 合并
const mcpTools = await client.tools()
const allTools = { ...localTools, ...mcpTools }
```

client 端需要确保:
- `MCP_ALLOWED_ROOTS` 透传(虽然客服 server 不读,但留个口子)
- 请求结束 `client.close()` 杀子进程(防 fd 泄漏)
- 工具失败的 `isError: true` → 走 `toUserMessage` 走前端用户友好气泡
