'use client';

/**
 * W9-UI:收纳低频功能(导出 JSON / Markdown)
 *
 * 真实客服系统的 header 不该被各种调试按钮挤满。
 * 跟 header 里的"新会话"+"切会话"等高频操作比,导出会话是低频操作
 * → 收纳到「⋯」菜单里,点开才出现。
 *
 * 设计:
 *  - 按钮用 unicode「⋯」(horizontal ellipsis),跟 macOS / iOS 的「more」语义一致
 *  - 点击外部关闭(标准 popover 行为)
 *  - 空会话时两个菜单项都 disabled(用 session.messageCount 判定)
 *  - 沿用 ExportButtons 里的 download 触发方式(Blob + a.click + revoke)
 *
 * cs-round-013:导出时临时 fetch `/api/sessions/[id]/history` 拿 messages
 * (不再依赖 Session.messages 字段 — 列表 API 不返回 messages)。
 */

import { useState, useRef, useEffect } from 'react';
import type { UIMessage } from 'ai';
import type { Session } from '@/hooks/use-sessions';
import { storedToUIMessages } from '@/lib/refetch-history';
import type { StoredMessage } from '@/lib/erp-admin-client';
import { exportToJSON, exportToMarkdown, makeExportFilename } from '@/lib/export-session';

export interface MoreMenuProps {
  session: Session;
  /** 选传:转人工工单号,Markdown 里会显示 */
  escalationMap?: Record<
    string,
    { escalationId: string; estimatedWaitMinutes: number; urgency: string }
  >;
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

/** 临时拉 messages — 导出专用,不写入前端 useChat state */
async function fetchMessagesForExport(backendId: number): Promise<UIMessage[]> {
  const res = await fetch(`/api/sessions/${backendId}/history`);
  if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
  const json = (await res.json()) as { messages?: unknown };
  const stored = Array.isArray(json.messages) ? (json.messages as StoredMessage[]) : [];
  return storedToUIMessages(stored);
}

export function MoreMenu({ session, escalationMap }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const [lastExport, setLastExport] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isEmpty = session.messageCount === 0;

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  async function doExport(kind: 'json' | 'md') {
    if (isEmpty || busy) return;
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
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MoreMenu] ${kind} export failed:`, err);
      setLastExport(`❌ ${kind.toUpperCase()} 导出失败: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xl px-2 py-1 rounded leading-none transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-primary-soft)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
        aria-label="更多操作"
        aria-expanded={open}
        title="更多操作"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 rounded-2xl shadow-lg overflow-hidden min-w-[160px] z-10 py-1"
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void doExport('json')}
            disabled={isEmpty || busy}
            title={isEmpty ? '空会话没有内容可导出' : '导出当前会话为 JSON(完整结构)'}
            className="w-full text-left px-4 py-2.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-primary-soft)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            📥 导出 JSON
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void doExport('md')}
            disabled={isEmpty || busy}
            title={isEmpty ? '空会话没有内容可导出' : '导出当前会话为 Markdown(人类可读)'}
            className="w-full text-left px-4 py-2.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-primary-soft)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            📥 导出 Markdown
          </button>
        </div>
      )}
      {lastExport && (
        <span className="text-[11px]" style={{ color: 'var(--success)' }} title={lastExport}>
          ✅ {lastExport}
        </span>
      )}
    </div>
  );
}