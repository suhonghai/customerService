/**
 * F7 Day 9:单会话导出(纯函数,前端 / 测试都可调)
 *
 * 提供两个序列化器:
 *   - exportToJSON(session, messages) → 完整 session 对象,适合备份 / 二次分析
 *   - exportToMarkdown(session, messages) → 人类可读,适合贴到工单 / 知识库
 *
 * 设计:
 *   - 不依赖 React,纯字符串处理 → 单元测试友好
 *   - JSON 含 parts / metadata / escalationMap 全量(可重建 UI)
 *   - Markdown 把 reasoning / tool-* 折成引用块 + emoji,人工一眼能看
 *
 * cs-round-013:`messages` 不再内联在 Session 上(前端不做持久化),由调用方
 * 在导出时临时 fetch `/api/sessions/[id]/history` 拿到。Session 仅含元数据
 * (id / title / startedAt / updatedAt / messageCount)。
 */

import type { Session } from '@/hooks/use-sessions';
import type { UIMessage } from 'ai';

/* ===== JSON ===== */

/**
 * 把 session 序列化成 JSON 字符串。
 * 用 JSON.stringify(_, null, 2) 缩进 2 空格,人类 + 机器都友好。
 */
export function exportToJSON(session: Session, messages: UIMessage[]): string {
  // 显式列举字段(避免泄漏 message 内部未文档化的字段)
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      title: session.title,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      startedAtISO: new Date(session.startedAt).toISOString(),
      updatedAtISO: new Date(session.updatedAt).toISOString(),
      messageCount: messages.length,
      messages,
    },
  };
  return JSON.stringify(payload, null, 2);
}

/* ===== Markdown ===== */

/** export-session 实际访问的 part 最小结构 */
interface ExportPart {
  type: string;
  toolName?: string;
  text?: string;
  reasoning?: string;
  state?: string;
  input?: unknown;
  args?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
}

/** export-session 实际访问的 metadata 最小结构 */
interface ExportMetadata {
  retrieval?: {
    query?: string;
    topK?: number;
    results?: Array<{
      ref?: string;
      source?: string;
      score?: number;
      preview?: string;
      text?: string;
    }>;
  };
  usage?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cost?: number;
  };
  aborted?: boolean;
  messageCreatedAt?: string;
  [key: string]: unknown;
}

// 从 UIMessage.parts 抽 text(AI SDK 6.x 多 text part 时合并)
function getText(parts: ExportPart[] | undefined): string {
  if (!parts) return '';
  return parts
    .filter((p: ExportPart) => p.type === 'text')
    .map((p: ExportPart) => p.text ?? '')
    .join('');
}

// 工具调用的人类可读总结(从 part 抽 input / output / state)
function describeToolCall(p: ExportPart): string {
  const name = p.type === 'dynamic-tool' ? p.toolName : p.type.replace(/^tool-/, '');
  const input = p.input ?? p.args ?? {};
  const state = p.state ?? 'unknown';
  const inputStr = Object.keys(input).length > 0 ? JSON.stringify(input, null, 2) : '(无参数)';

  let outputStr = '';
  if (state === 'output-available') {
    const out = p.output;
    outputStr = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
  } else if (state === 'output-error') {
    outputStr = `❌ 错误: ${p.errorText ?? 'unknown'}`;
  } else if (state === 'input-streaming' || state === 'input-available') {
    outputStr = '⏳ 等待输出...';
  }

  // 截断过长的 output,避免 markdown 撑爆
  const MAX_OUT = 800;
  const MAX_IN = 400;
  let truncatedOut = outputStr;
  let truncatedIn = inputStr;
  if (truncatedOut.length > MAX_OUT) {
    truncatedOut =
      truncatedOut.slice(0, MAX_OUT) +
      '\n... (已截断,共 ' +
      (typeof p.output === 'string' ? p.output.length : JSON.stringify(p.output ?? '').length) +
      ' 字符)';
  }
  if (truncatedIn.length > MAX_IN) {
    truncatedIn = truncatedIn.slice(0, MAX_IN) + '\n... (已截断)';
  }

  return `> 🔧 **${name}** _(${state})_
>
> **输入**:
> \`\`\`json
> ${truncatedIn.split('\n').join('\n> ')}
> \`\`\`
${
  truncatedOut
    ? `> **输出**:
> \`\`\`
> ${truncatedOut.split('\n').join('\n> ')}
> \`\`\``
    : ''
}`;
}

// 推理/思考链 part
function describeReasoning(p: ExportPart): string {
  const text = p.text ?? p.reasoning ?? '';
  if (!text) return '';
  return `> 💭 _${text}_`;
}

// 检索详情 → 引用列表(从 message.metadata.retrieval.results)
function describeRetrieval(metadata: ExportMetadata | undefined): string {
  const results = metadata?.retrieval?.results;
  if (!Array.isArray(results) || results.length === 0) return '';
  const lines: string[] = ['', '**📚 引用资料:**'];
  results.forEach((r, i) => {
    const ref = r.ref ?? `[${i + 1}]`;
    const source = r.source ?? 'unknown';
    const score = typeof r.score === 'number' ? r.score.toFixed(3) : 'n/a';
    const preview = r.preview ?? r.text ?? '';
    lines.push(`${i + 1}. **${ref}** — \`${source}\` (相似度 ${score})`);
    if (preview) lines.push(`   > ${preview}`);
  });
  return lines.join('\n');
}

// 一条消息的 metadata 摘要(避免 markdown 撑爆)
function describeMetadata(metadata: ExportMetadata | undefined): string {
  if (!metadata) return '';
  const lines: string[] = ['', '<details><summary>📋 元数据(展开)</summary>', ''];
  if (metadata.retrieval) {
    lines.push(`- **检索查询**: ${metadata.retrieval.query ?? '(无)'}`);
    lines.push(`- **Top K**: ${metadata.retrieval.topK ?? '(无)'}`);
  }
  if (metadata.usage) {
    const u = metadata.usage;
    lines.push(`- **Token**: ${u.totalTokens} (输入 ${u.inputTokens} · 输出 ${u.outputTokens})`);
    if (typeof u.cost === 'number') {
      lines.push(`- **费用**: ¥${u.cost.toFixed(4)}`);
    }
  }
  if (metadata.aborted === true) {
    lines.push('- **⛔ 已被用户取消**');
  }
  if (lines.length <= 2) return '';
  lines.push('', '</details>');
  return lines.join('\n');
}

/**
 * 把 session 序列化成 Markdown。
 * 格式:
 *   # {title}
 *   元信息(id / 创建时间 / 消息数)
 *   ---
 *   ## 👤 用户 (timestamp)
 *   text
 *   ## 🤖 AI (timestamp)
 *   💭 思考 / 🔧 工具 / text
 *   📚 引用 / 元数据
 *   ---
 */
export function exportToMarkdown(
  session: Session,
  messages: UIMessage[],
  escalationMap?: Record<
    string,
    { escalationId: string; estimatedWaitMinutes: number; urgency: string }
  >,
): string {
  const lines: string[] = [];
  const created = new Date(session.startedAt).toLocaleString('zh-CN');
  const updated = new Date(session.updatedAt).toLocaleString('zh-CN');
  const msgCount = messages.length;

  lines.push(`# ${session.title || '(无标题)'}`);
  lines.push('');
  lines.push(`- **会话 ID**: \`${session.id}\``);
  lines.push(`- **创建时间**: ${created}`);
  lines.push(`- **更新时间**: ${updated}`);
  lines.push(`- **消息数**: ${msgCount}`);
  lines.push(`- **导出时间**: ${new Date().toLocaleString('zh-CN')}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (msgCount === 0) {
    lines.push('_本会话没有消息。_');
    return lines.join('\n');
  }

  messages.forEach((m, idx) => {
    // AI SDK 6.x UIMessage.metadata 是 unknown(用户自定义),这里 cast 到 ExportMetadata 子集
    const meta = m.metadata as ExportMetadata | undefined
    const ts = meta?.messageCreatedAt
      ? new Date(meta.messageCreatedAt).toLocaleString('zh-CN')
      : '';
    const roleEmoji = m.role === 'user' ? '👤' : '🤖';
    const roleLabel = m.role === 'user' ? '用户' : 'AI';
    const titleSuffix = ts ? ` _(${ts})_` : '';
    lines.push(`## ${roleEmoji} ${roleLabel} — 消息 #${idx + 1}${titleSuffix}`);
    lines.push('');

    // 工具调用 + 推理(AI 消息,按 parts 原序穿插)
    if (m.role === 'assistant' && Array.isArray(m.parts)) {
      const decisionParts = m.parts.filter(
        (p: ExportPart) =>
          p.type === 'reasoning' ||
          p.type === 'dynamic-tool' ||
          (typeof p.type === 'string' && p.type.startsWith('tool-')),
      );
      for (const p of decisionParts) {
        if (p.type === 'reasoning') {
          const r = describeReasoning(p);
          if (r) {
            lines.push(r);
            lines.push('');
          }
        } else {
          lines.push(describeToolCall(p));
          lines.push('');
        }
      }
    }

    // 文本主体
    const text = getText(m.parts);
    if (text) {
      lines.push(text);
      lines.push('');
    } else if (m.role === 'assistant') {
      lines.push('_(无文本输出)_');
      lines.push('');
    }

    // 检索引用(AI 消息)
    if (m.role === 'assistant') {
      const retrieval = describeRetrieval(meta);
      if (retrieval) {
        lines.push(retrieval);
        lines.push('');
      }
    }

    // 工单号(AI 消息 + 当前会话的 escalationMap 里有该 messageId)
    if (m.role === 'assistant' && escalationMap && escalationMap[m.id]) {
      const esc = escalationMap[m.id];
      lines.push(
        `> 🎫 **已转人工** — 工单号 \`${esc.escalationId}\` (${esc.urgency} · 预计 ${esc.estimatedWaitMinutes} 分钟响应)`,
      );
      lines.push('');
    }

    // 元数据
    if (m.role === 'assistant') {
      const metadataDesc = describeMetadata(meta);
      if (metadataDesc) {
        lines.push(metadataDesc);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

/* ===== 文件名工具 ===== */

/**
 * 生成下载文件名,格式: {title-slug}-{YYYYMMDD-HHmm}.{ext}
 * - 标题清掉非法字符(Windows 文件名规范)
 * - 默认标题 'session'
 */
export function makeExportFilename(session: Session, ext: 'json' | 'md'): string {
  const safeTitle =
    (session.title || 'session')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 50) || 'session';
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes());
  return `${safeTitle}-${stamp}.${ext}`;
}
