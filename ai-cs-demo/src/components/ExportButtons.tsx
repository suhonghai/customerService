'use client';

import { useState } from 'react';
import type { UIMessage } from 'ai';
import type { Session } from '@/hooks/use-sessions';
import { storedToUIMessages } from '@/lib/refetch-history';
import type { StoredMessage } from '@/lib/erp-admin-client';
import { exportToJSON, exportToMarkdown, makeExportFilename } from '@/lib/export-session';

/**
 * W9-10 Day 9 (F7):单会话导出按钮
 *
 * 设计:
 *  - 2 个小按钮:「📥 JSON」「📥 MD」
 *  - 点击 → 浏览器下载(Blob + URL.createObjectURL + <a download>)
 *  - 文件名:{title-slug}-{YYYYMMDD-HHmm}.{ext}
 *  - disabled = 当前 session 没有消息(空会话导了也没意义)
 *
 * 父组件传 escalationMap(从 page.tsx 拿),这样 Markdown 里能带工单号。
 *
 * cs-round-013:导出时临时 fetch `/api/sessions/[id]/history` 拿 messages。
 * 不再依赖 Session.messages 字段(列表 API 不返回 messages)。
 */

export interface ExportButtonsProps {
  session: Session;
  /** 选传:转人工工单号,Markdown 里会显示 */
  escalationMap?: Record<
    string,
    { escalationId: string; estimatedWaitMinutes: number; urgency: string }
  >;
  /** 选传:按钮 disabled 时(默认空会话 disabled) */
  disabled?: boolean;
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchMessagesForExport(backendId: number): Promise<UIMessage[]> {
  const res = await fetch(`/api/sessions/${backendId}/history`);
  if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
  const json = (await res.json()) as { messages?: unknown };
  const stored = Array.isArray(json.messages) ? (json.messages as StoredMessage[]) : [];
  return storedToUIMessages(stored);
}

export function ExportButtons({ session, escalationMap, disabled }: ExportButtonsProps) {
  const [lastExport, setLastExport] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const isEmpty = session.messageCount === 0;
  const isDisabled = disabled || isEmpty || busy;

  async function doExport(kind: 'json' | 'md') {
    if (isDisabled) return;
    setBusy(true);
    try {
      const messages = await fetchMessagesForExport(session.id);
      const content =
        kind === 'json'
          ? exportToJSON(session, messages)
          : exportToMarkdown(session, messages, escalationMap);
      const filename = makeExportFilename(session, kind);
      triggerDownload(filename, content, kind === 'json' ? 'application/json' : 'text/markdown');
      setLastExport(`${kind.toUpperCase()} → ${filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[export] ${kind} failed:`, err);
      setLastExport(`❌ ${kind.toUpperCase()} 导出失败: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void doExport('json')}
        disabled={isDisabled}
        title={isEmpty ? '空会话没有内容可导出' : '导出当前会话为 JSON(完整结构)'}
        className="text-xs px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: 'var(--surface-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-primary-soft)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--brand-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-elevated)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        }}
      >
        📥 JSON
      </button>
      <button
        type="button"
        onClick={() => void doExport('md')}
        disabled={isDisabled}
        title={isEmpty ? '空会话没有内容可导出' : '导出当前会话为 Markdown(人类可读)'}
        className="text-xs px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: 'var(--surface-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-primary-soft)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--brand-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-elevated)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        }}
      >
        📥 MD
      </button>
      {lastExport && (
        <span className="text-[11px]" style={{ color: 'var(--success)' }} title={lastExport}>
          ✅ {lastExport}
        </span>
      )}
    </div>
  );
}