/**
 * 错误处理:把任意 error 转成用户友好的中文文案 + 行动按钮
 *
 * 设计目的:错误文案集中管理,出错处不再散落 setUploadStatus / alert / throw
 *
 * W11:删 'go-upload' action 类型 + FAQ 知识库空 这一类(扫描逻辑也已移除)—
 * KB 里没具体 FAQ 内容时 AI 自然走通识回答,不该弹"去上传"误导用户以为整个 KB 空的。
 *
 * action type:
 *   - 'escalate' — W9-10 客服"转人工"按钮
 */

export type UserFacingErrorActionType = 'retry' | 'reset' | 'docker' | 'reload' | 'escalate';

export interface UserFacingError {
  /** 红底气泡标题,如"百炼 API key 无效" */
  title: string;
  /** 灰色提示行,告诉用户怎么修 */
  hint: string;
  /** 可选行动按钮 */
  action?: {
    label: string;
    type: UserFacingErrorActionType;
    /** docker 类型时显示的命令 */
    command?: string;
  };
  /** 原始错误,折叠区可展开看 */
  raw?: unknown;
}

/**
 * 把任意 error / message string / 普通对象 → UserFacingError
 *
 * 输入可能来自:
 * - useChat 的 error state(Error 实例,有 message / cause / 可能有 status / response)
 * - 后端 error chunk(序列化后的 string,包含原始 message)
 * - upload API 的 response.json().error(string)
 */
export function toUserMessage(err: unknown): UserFacingError {
  const message = extractMessage(err);
  const status = extractStatus(err);
  const code = extractCode(err);

  // 1. API key 错(401)
  if (status === 401 || /invalid[_ ]api[_ ]key|unauthorized|incorrect api key/i.test(message)) {
    return {
      title: '百炼 API key 无效',
      hint: '检查 .env.local 里的 DASHSCOPE_API_KEY 是否正确,然后重启 dev server。',
      action: { label: '刷新页面', type: 'reload' },
      raw: err,
    };
  }

  // 6. Chroma 挂(优先于通用网络错,因为也是 ECONNREFUSED)
  if (/ECONNREFUSED.*8001|localhost:8001|ChromaError|chromadb/i.test(message)) {
    return {
      title: '向量数据库不可用',
      hint: 'Chroma docker 没在跑。终端执行下面命令,然后刷新页面。',
      action: {
        label: '复制 docker 命令',
        type: 'docker',
        command: 'docker start chroma-rag',
      },
      raw: err,
    };
  }

  // 2. 网络/超时
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    /TimeoutError|fetch failed|network error|socket hang up/i.test(message)
  ) {
    return {
      title: '网络不通',
      hint: '检查你的网络;或百炼服务可能临时不可用,稍后再试。',
      action: { label: '重发', type: 'retry' },
      raw: err,
    };
  }

  // 3. 限流(429)
  if (status === 429 || /rate[_ ]limit|too many requests|429/i.test(message)) {
    return {
      title: '请求太频繁',
      hint: '百炼免费额度有 QPM 限制,等 30 秒再试;或在 .env.local 切到 qwen-turbo(更便宜更宽松)。',
      action: { label: '稍后重发', type: 'retry' },
      raw: err,
    };
  }

  // 4. 超 token / context 太长(400 + 关键词)
  if (/context[_ ]length|maximum.*tokens|max[_ ]tokens|token.*limit|too long/i.test(message)) {
    return {
      title: '对话太长,超出模型上下文',
      hint: '清空当前会话重开;或减少 Top K(检索块数)/ 删些上传的文档。',
      action: { label: '清空会话', type: 'reset' },
      raw: err,
    };
  }

  // 5. 工具执行错(后端 route catch 时把 toolName 拼到 message)
  const toolMatch = message.match(/tool[\s_]+([a-z_]+).*?(failed|error)/i);
  if (toolMatch) {
    return {
      title: `工具 ${toolMatch[1]} 调用失败`,
      hint: `工具说: ${message.slice(0, 200)}。换个问法,或不依赖这个工具。`,
      action: { label: '重发', type: 'retry' },
      raw: err,
    };
  }

  // 6.1 MCP 启动失败(子进程 spawn 失败:tsx/npx 没装、路径错等)
  if (/ENOENT|spawn.*tsx|command not found|MCP.*start.*fail/i.test(message)) {
    return {
      title: 'MCP 工具启动失败',
      hint: '检查 npx / tsx 是否安装:pnpm add -D tsx。终端报错详情看下面。',
      action: { label: '重发', type: 'retry' },
      raw: err,
    };
  }

  // 6.2 MCP 启动超时(5s 内没收到 initialize 响应)
  if (/MCP.*timeout|MCP.*超时|initialize.*timeout/i.test(message)) {
    return {
      title: 'MCP 启动超时',
      hint: 'MCP server 5 秒内没回应。看终端日志确认 tsx 能跑通,确认 .env.local 里 MCP_ALLOWED_ROOTS 是绝对路径。',
      action: { label: '重发', type: 'retry' },
      raw: err,
    };
  }

  // 6.3 MCP 工具返回 isError:true(透传工具错误文本)
  if (/🚫|isError.*true|MCP.*tool.*error/i.test(message)) {
    return {
      title: 'MCP 工具执行出错',
      hint: `MCP 工具说: ${message.slice(0, 200)}。换个问法,或不依赖此工具。`,
      action: { label: '重发', type: 'retry' },
      raw: err,
    };
  }

  // 6.4 MCP 路径越界(isPathSafe 拒绝)
  if (/outside allowed roots|路径越界/i.test(message)) {
    return {
      title: 'MCP 路径越界',
      hint: 'MCP 工具只能访问 .env.local 里 MCP_ALLOWED_ROOTS 配置的目录。修改环境变量后重启 dev server。',
      action: { label: '重发', type: 'retry' },
      raw: err,
    };
  }

  // 6.5 MCP git 非仓库(在非 git 目录调 git_status / git_diff)
  if (/not a git repository|MCP.*git.*fail/i.test(message)) {
    return {
      title: 'MCP 调 git 失败',
      hint: '传入的目录不是 git 仓库。换个目录,或不依赖 git 工具。',
      action: { label: '重发', type: 'retry' },
      raw: err,
    };
  }

  // ============ W9-10 客服专用 2 类(Day 7 新增) ============

  // 10. 订单不存在(mcp get_user_order 返 { error: "NOT_FOUND" })
  // Day 8 新增:独立类,避免被下面 FAQ_EMPTY 的宽松 regex 误吞
  // 触发场景:用户问订单 #999(mock 库没这个号)
  if (
    /get_user_order.*NOT_FOUND|订单号.*不存在|订单.*不存在/i.test(message) ||
    (code === 'NOT_FOUND' && /get_user_order|订单/i.test(message))
  ) {
    return {
      title: '订单不存在',
      hint: '请检查订单号是否正确,或联系人工客服查询。',
      // 故意没 action 按钮 — 订单不存在是用户输入错,让用户重新说一次即可
      // (转人工在每条 AI 消息下方有专门的按钮,这里不再冗余)
      raw: err,
    };
  }

  // 8. 订单 API 挂(mcp get_user_order 返 { error: "INTERNAL", retryable: true })
  // 触发场景:改坏 mock-orders.json(JSON 解析错) / 文件读失败 / chroma 等其他依赖挂
  if (
    /get_user_order.*INTERNAL|订单.*查询.*失败|order.*api.*down|订单.*系统.*异常/i.test(message) ||
    (code === 'ENOENT' && /mock.?orders/i.test(message))
  ) {
    return {
      title: '订单查询暂时不可用',
      hint: '可能是订单系统升级中,请稍后重试或转人工。',
      action: { label: '转人工', type: 'escalate' },
      raw: err,
    };
  }

  // 7. 上传失败(由前端 upload catch 直接 new 一个 UserFacingError,不一定走这里)
  if (/upload|文件.*失败|file too large/i.test(message)) {
    return {
      title: '上传失败',
      hint: '文件可能损坏 / 是扫描版 PDF 无文字层 / Embedding 限流。错误详情见下。',
      action: { label: '重传', type: 'retry' },
      raw: err,
    };
  }

  // 兜底
  return {
    title: '未知错误',
    hint: '请把下面的错误详情贴给开发者(也欢迎复制到 issue 里)。',
    raw: err,
  };
}

// ============ 内部辅助:从各种形态的 error 拿 message / status / code ============

function extractMessage(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message ?? '';
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function extractStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== 'object') return undefined;
  const obj = err as Record<string, unknown>;
  // 直接 status / statusCode
  if (typeof obj.status === 'number') return obj.status;
  if (typeof obj.statusCode === 'number') return obj.statusCode;
  // 嵌套 response.status(fetch / axios 风格)
  const resp = obj.response as Record<string, unknown> | undefined;
  if (resp && typeof resp.status === 'number') return resp.status;
  // 嵌套 cause(Error.cause)
  const cause = obj.cause;
  if (cause != null) return extractStatus(cause);
  // 从 message 抠 "401" / "429"(百炼 OpenAI 兼容模式有时只有字符串)
  const msg = extractMessage(err);
  const m = msg.match(/\b(4\d\d|5\d\d)\b/);
  if (m) return Number(m[1]);
  return undefined;
}

function extractCode(err: unknown): string | undefined {
  if (err == null || typeof err !== 'object') return undefined;
  const obj = err as Record<string, unknown>;
  if (typeof obj.code === 'string') return obj.code;
  const cause = obj.cause;
  if (cause != null) return extractCode(cause);
  return undefined;
}

// ============ W9-10 客服专用错误工厂(Day 7 新增) ============
// page.tsx 在 streaming 完之后扫 parts 数组 + 检索 metadata,
// 主动构造 UserFacingError,不走 regex(更可靠)。

/** 8. 订单 API 挂(parts 中 get_user_order state === 'output-error' / 内部 INTERNAL) */
export function orderApiDownError(raw: unknown): UserFacingError {
  return {
    title: '订单查询暂时不可用',
    hint: '可能是订单系统升级中,请稍后重试或转人工。',
    action: { label: '转人工', type: 'escalate' },
    raw,
  };
}

/**
 * 10. 订单不存在(Day 8 新增)
 * 触发:mcp get_user_order 返 { error: "NOT_FOUND", message: "订单号 #xxx 不存在" }
 * 跟 ORDER_API_DOWN 区别:这里用户输入错,系统没问题,不该诱导「转人工」
 */
export function orderNotFoundError(raw: unknown): UserFacingError {
  return {
    title: '订单不存在',
    hint: '请检查订单号是否正确,或联系人工客服查询。',
    raw,
  };
}
