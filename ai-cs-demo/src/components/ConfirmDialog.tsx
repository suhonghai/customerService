'use client';

/**
 * W9-UI:ConfirmDialog — 自写确认弹窗(替代浏览器原生 confirm/alert)
 *
 * 为什么自写:
 *   - ai-cs-demo 不依赖 antd / shadcn / @radix-ui/react-dialog
 *     (宪法 II 简洁优先,不引入新依赖)
 *   - 浏览器原生 confirm 灰色样式 + 浅绿/深绿按钮,跟项目暖橙 #ff6b35 视觉系统割裂
 *
 * 视觉契约:
 *   - 沿用 globals.css CSS 变量(--brand-primary / --error / --surface / --border)
 *   - 遮罩 bg-black/40 + backdrop-blur-sm(对齐 RAGChat 移动端遮罩风格)
 *   - 卡片 rounded-2xl + shadow-xl + 米白 surface-elevated
 *   - 进场 fadeInUp 0.3s(globals.css 已定义 .animate-fade-in-up)
 *
 * 交互契约:
 *   - 点击遮罩关闭 / Esc 关闭 / 两按钮分别触发 onClose / onConfirm
 *   - busy=true 时两按钮都 disabled(防请求中误关 — 删除/结束对话场景)
 *   - 打开时焦点落到「主按钮」(避免「删除」按钮一上来就吸焦误回车)
 *   - a11y:role="alertdialog" + aria-labelledby / aria-describedby
 *
 * 用法:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onConfirm={async () => { await doDelete(); setOpen(false); }}
 *     title="删除会话?"
 *     description="此操作不可恢复。"
 *     confirmLabel="删除"
 *     cancelLabel="取消"
 *     variant="danger"
 *     busy={submitting}
 *   />
 */

import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  /** 默认「确认」 */
  confirmLabel?: string;
  /** 默认「取消」 */
  cancelLabel?: string;
  /** 'default' 暖橙主按钮 / 'danger' 红色主按钮(对应删除等危险操作) */
  variant?: 'default' | 'danger';
  /** 处理中态:两按钮都 disable,且 cancel 不响应遮罩/Esc 关闭 */
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'default',
  busy = false,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // Esc 关闭(busy 时不响应)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, busy, onClose]);

  // 打开时把焦点落到主按钮(避免一开始就聚焦「删除」误回车)
  useEffect(() => {
    if (open && confirmBtnRef.current) {
      // 延迟一帧,等进场动画开始再聚焦,避免被 transition 打断
      const t = setTimeout(() => confirmBtnRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  function handleBackdropClick() {
    if (!busy) onClose();
  }

  async function handleConfirm() {
    if (busy) return;
    await onConfirm();
  }

  // 主按钮样式按 variant 分支
  const confirmBtnStyle =
    variant === 'danger'
      ? {
          background: 'var(--error)',
          color: '#FFFFFF',
        }
      : {
          background: 'var(--brand-primary)',
          color: '#FFFFFF',
        };
  const confirmBtnHoverStyle =
    variant === 'danger' ? '#b03f31' : 'var(--brand-primary-hover)';

  // cs-round-041:用 createPortal 渲染到 document.body,
  // 避免被父容器(transform/fixed/filter)劫持为 containing block。
  // 父组件 SessionList 被 RAGChat 包在带 `transform transition-transform` 的
  // mobileSidebarOpen wrapper 里,导致 fixed inset-0 相对 wrapper 而非 viewport。
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in-up"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl shadow-xl p-5"
        style={{
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border)',
        }}
      >
        <h2
          id={titleId}
          className="display text-base font-semibold leading-snug"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h2>

        {description && (
          <p
            id={descId}
            className="mt-2 text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--text-secondary)' }}
          >
            {description}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--surface-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => {
              if (busy) return;
              (e.currentTarget as HTMLButtonElement).style.background =
                'var(--brand-primary-soft)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'var(--surface-elevated)';
            }}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={confirmBtnStyle}
            onMouseEnter={(e) => {
              if (busy) return;
              (e.currentTarget as HTMLButtonElement).style.background =
                confirmBtnHoverStyle;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                variant === 'danger' ? 'var(--error)' : 'var(--brand-primary)';
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}