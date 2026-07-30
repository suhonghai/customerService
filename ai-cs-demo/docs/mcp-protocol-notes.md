# MCP 协议学习笔记

> 2026-06-11 学完模块 ⑦ 的笔记
> 对应:`../scripts/mcp-servers/local-dev-tools.ts` + AI SDK 6.x 集成

## 1. MCP 是什么

**MCP**(Model Context Protocol)是 Anthropic 2024 年提出的**AI 工具协议**,本质:

- 一种 **JSON-RPC 2.0** 消息格式(基于 stdin/stdout 或 HTTP/SSE)
- 3 种原语:
  - **Tools** — AI 可调用的函数
  - **Resources** — AI 可读的数据(URI 寻址)
  - **Prompts** — 预制提示词模板(可选)
- 跨厂商通用:Anthropic / OpenAI / 自建都按 MCP 标准接

**核心收益**:**工具可插拔**。客户端(AI)不用关心工具是 SDK 内置、HTTP 远程、还是 stdio 子进程——看到的都是统一 `{ [name]: ToolSchema }` map。

## 2. 一次完整会话的 JSON-RPC 消息

以「代码 review」场景为例,Next.js 启一个 MCP client 子进程后:

```
[CLIENT → SERVER]  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05",...}}
[SERVER → CLIENT]  {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"local-dev-tools","version":"0.1.0"},"capabilities":{"tools":{},"resources":{}}}}
[CLIENT → SERVER]  {"jsonrpc":"2.0","method":"notifications/initialized"}
[CLIENT → SERVER]  {"jsonrpc":"2.0","id":2,"method":"tools/list"}
[SERVER → CLIENT]  {"jsonrpc":"2.0","id":2,"result":{"tools":[{name:"read_file",...},{name:"git_status",...},...]}}
[CLIENT → SERVER]  {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"git_status","arguments":{"cwd":"."}}}
[SERVER → CLIENT]  {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"M package.json\nM src/lib/errors.ts"}]}}
... 重复 tools/call 直到 AI 拿到足够信息 ...
[CLIENT 关闭]        client.close() → SIGTERM 子进程
```

## 3. 调试命令

### 3.1 协议层裸调试(curl 等价)

```bash
cd W7-8-agent/ai-agent-demo
MCP_ALLOWED_ROOTS=/Users/suesea/sueSea/agents pnpm mcp:dev <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
EOF
```

stdout 应看到 2 条 JSON-RPC 响应。

### 3.2 AI SDK 集成调试

```bash
pnpm dev  # 启 9528
# 终端实时看:
# [mcp-server] allowed roots: ...
# [mcp-server] connected, waiting for JSON-RPC messages on stdin
# [chat] tools: get_weather, calc, ..., read_file, write_file, ...
# [agent] 3 tool call(s): [ 'git_status', 'read_file', 'grep' ]
```

### 3.3 子进程泄漏排查

```bash
# 9528 跑久了变慢,看是不是 MCP 子进程没关
ps aux | grep -E "tsx scripts/mcp-servers" | grep -v grep | wc -l
# 应该是 0(请求结束后都关了)
# 如果 > 0 说明 finally close 没生效,看 route.ts
```

## 4. 经验 / 坑

1. **stdio 是行分隔的**:每条 JSON-RPC 消息是一行 JSON,以 `\n` 结尾。不要写多行 JSON,SDK 解析会挂。
2. **initialize 必须 + notifications/initialized 配对**:少了第二个,server 端认为握手没完成,不接后续请求。
3. **isError 是工具结果的一部分,不是 JSON-RPC 错误**:MCP 把"工具失败"和"协议失败"分开——前者用 `result.isError: true`,后者用 JSON-RPC 的 `error` 字段。
4. **资源 URI 模板用 `{name}` 占位**:SDK 帮你解析 path;server.resource 的 handler 拿到的 `uri.pathname` 是已解析的路径。
5. **stdio 客户端的 env 必须显式透传**:子进程不会自动继承父进程的 `process.env`,MCP_ALLOWED_ROOTS 要手动 `env: { ...process.env, ... }`。
6. **JSON-RPC 响应字段顺序**:`result` 在前,`jsonrpc`/`id` 在后。pipe 解析时用 `^\{` 过滤更稳,不要写 `^\{"jsonrpc"'`。
7. **BSD `find ... -exec grep -e` 退出码语义**:`find` 退出码 1 表示"任何 -exec 子命令失败",而 BSD grep 自身退出码 1 = "无匹配"、退出码 2 = "无效正则"。`err.code === 1` 来自 `find`,不是 grep。要区分"无匹配"和"无效正则",靠 `err.stderr` 文本判断(stderr 里有 `brackets not balanced` / `Invalid regular expression` 等关键字)。

## 5. 跟 W5-6 自建工具的对比

| 维度 | W5-6 自建工具 | MCP 工具 |
|---|---|---|
| 定义位置 | `src/lib/agent/tools/*.ts` 源码 | `scripts/mcp-servers/local-dev-tools.ts`(独立进程) |
| 怎么加一个 | 写 .ts + register 进 `tools/index.ts` | 改 server.ts + 重启 dev server |
| 隔离 | 同进程,无隔离 | 独立子进程,崩了不影响 Next.js |
| 复用 | 只能本项目用 | 任何 MCP 客户端都能用(Claude Desktop、Cursor 等) |
| 类型校验 | Zod schema + AI SDK `inputSchema` | Zod schema + MCP `inputSchema` |
| 错误处理 | defineTool 包装 → `{error:true, message}` | `isError: true` + `content[].text` |

**关键观察**:MCP 工具和自建工具在 AI SDK 眼里是**同质的**——`streamText({ tools: { ...all } })` 不需要知道哪些是 MCP、哪些是本地。这就是 MCP 协议设计的核心收益。
