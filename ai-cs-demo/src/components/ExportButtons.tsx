'use client';

import { useState } from 'react';
import type { Session } from '@/hooks/use-sessions';
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
  // 延迟 revoke,确保浏览器有足够时间触发下载
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportButtons({ session, escalationMap, disabled }: ExportButtonsProps) {
  const [lastExport, setLastExport] = useState<string>('');

  const isEmpty = session.messages.length === 0;
  const isDisabled = disabled || isEmpty;

  function handleExportJSON() {
    if (isDisabled) return;
    try {
      const content = exportToJSON(session);
      const filename = makeExportFilename(session, 'json');
      triggerDownload(filename, content, 'application/json');
      setLastExport(`JSON → ${filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[export] JSON failed:', err);
      setLastExport(`❌ JSON 导出失败: ${msg}`);
    }
  }

  function handleExportMD() {
    if (isDisabled) return;
    try {
      const content = exportToMarkdown(session, escalationMap);
      const filename = makeExportFilename(session, 'md');
      triggerDownload(filename, content, 'text/markdown');
      setLastExport(`MD → ${filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[export] MD failed:', err);
      setLastExport(`❌ MD 导出失败: ${msg}`);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleExportJSON}
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
        onClick={handleExportMD}
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
