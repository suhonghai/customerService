'use client';

import { useState } from 'react';
import type { UserFacingError, UserFacingErrorActionType } from '@/lib/errors';

/**
 * 错误气泡:展示在聊天区或上传区下方的红底友好提示
 *
 * 三块:
 * - 标题(红):"百炼 API key 无效"
 * - 提示(灰):怎么修
 * - 行动按钮:retry / reset / reload(普通按钮)或 docker(复制命令)
 * - 原始错误(折叠):开发调试用
 */
export function ErrorBubble({
  error,
  onAction,
}: {
  error: UserFacingError;
  onAction?: (type: UserFacingErrorActionType) => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleAction() {
    if (!error.action) return;
    if (error.action.type === 'docker' && error.action.command) {
      navigator.clipboard
        .writeText(error.action.command)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {
          /* 降级:弹个 alert */
          alert(error.action!.command);
        });
      return;
    }
    onAction?.(error.action.type);
  }

  return (
    <div
      role="alert"
      className="rounded-2xl p-4 my-2 text-sm"
      style={{
        background: '#fff5f3',
        border: '1px solid #f5c5be',
      }}
    >
      <div className="font-medium" style={{ color: 'var(--error)' }}>
        ❌ {error.title}
      </div>
      <div className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
        {error.hint}
      </div>

      {error.action && (
        <button
          type="button"
          onClick={handleAction}
          className="mt-3 inline-flex items-center text-xs px-4 py-2 rounded-full text-white transition-colors"
          style={{ background: 'var(--error)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#b03f31';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--error)';
          }}
        >
          {error.action.type === 'docker'
            ? copied
              ? '✅ 已复制'
              : `📋 ${error.action.label}`
            : error.action.type === 'escalate'
              ? `🙋 ${error.action.label}`
              : error.action.label}
        </button>
      )}
    </div>
  );
}
