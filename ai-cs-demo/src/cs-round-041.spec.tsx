/**
 * @status implemented
 * @change-id cs-round-041
 *
 * cs-round-041: ai-cs 弹窗换皮(告别浏览器原生 confirm/alert)
 *
 * Why(为什么做):
 *   ai-cs-demo 现有 2 处用浏览器原生 `window.confirm()` / `window.alert()`,
 *   弹出灰色系统对话框(标题"localhost:9529 显示",按钮浅绿/深绿),
 *   跟项目自有的「W9-UI: Warm Tech / Cozy AI」暖橙 + 米白视觉系统完全割裂。
 *
 *   调用点:
 *   - `src/components/SessionList.tsx:67-70` — 删除会话确认
 *   - `src/components/chat/EndConversationButton.tsx:29-32` — 结束对话确认
 *   - `src/components/chat/EndConversationButton.tsx:39-41` — 失败用 alert
 *
 * Fix:
 *   新建 `src/components/ConfirmDialog.tsx`(自写,沿用 globals.css 设计令牌,
 *   主色 #ff6b35 / 错误色 #c84a3a / 米白 #fffaf6 / fadeInUp 进场),
 *   替换两处调用点的 confirm/alert。
 *
 * Spec 契约(代码契约 grep + 真实组件渲染,jsdom + RTL):
 *
 *   A. ConfirmDialog.tsx 文件存在 + 命名导出 ConfirmDialog
 *   B. SessionList.tsx 不再调用 window.confirm / confirm
 *   C. EndConversationButton.tsx 不再调用 window.confirm / window.alert
 *   D. ConfirmDialog 真实渲染 — 给定 props 渲染出 role="alertdialog" + title/desc/两按钮
 *      点击取消 → 触发 onClose;点击确认 → 触发 onConfirm
 *      open=false → 不渲染;busy=true → 两按钮都 disabled
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './components/ConfirmDialog';

const SRC = resolve(__dirname);

function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return (
        !t.startsWith('//') &&
        !t.startsWith('/*') &&
        !t.startsWith('*') &&
        !t.startsWith('*/')
      );
    })
    .join('\n');
}

describe('cs-round-041: ai-cs 弹窗换皮(ConfirmDialog + 替换 confirm/alert)', () => {
  // ── 契约 A:ConfirmDialog 文件存在 + 导出 ──
  describe('A. Given: src/components/ConfirmDialog.tsx', () => {
    it('Then: 文件存在 + 命名导出 ConfirmDialog', () => {
      const p = resolve(SRC, 'components/ConfirmDialog.tsx');
      expect(existsSync(p), 'ConfirmDialog.tsx 必须存在').toBe(true);
      const text = readFileSync(p, 'utf-8');
      expect(
        text,
        '必须 export function ConfirmDialog 或 export const ConfirmDialog',
      ).toMatch(/export\s+(function|const)\s+ConfirmDialog/);
    });
  });

  // ── 契约 B:SessionList 不再调用 confirm ──
  describe('B. Given: src/components/SessionList.tsx', () => {
    it('Then: 不再出现 window.confirm 或裸 confirm(', () => {
      const p = resolve(SRC, 'components/SessionList.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));
      expect(
        text,
        'SessionList 不应再调用 confirm(,已替换为 ConfirmDialog',
      ).not.toMatch(/\bconfirm\s*\(/);
    });
  });

  // ── 契约 C:EndConversationButton 不再调用 confirm/alert ──
  describe('C. Given: src/components/chat/EndConversationButton.tsx', () => {
    it('Then: 不再出现 window.confirm / confirm( 或 window.alert / alert(', () => {
      const p = resolve(SRC, 'components/chat/EndConversationButton.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));
      expect(
        text,
        'EndConversationButton 不应再调用 confirm(,已替换为 ConfirmDialog',
      ).not.toMatch(/\bconfirm\s*\(/);
      expect(
        text,
        'EndConversationButton 不应再调用 alert(,已替换为 ConfirmDialog',
      ).not.toMatch(/\balert\s*\(/);
    });
  });

  // ── 契约 D:ConfirmDialog 真实渲染(集成优先,RTL jsdom)──
  describe('D. Given: ConfirmDialog 组件', () => {
    it('Then: 给定 props → 渲染 role="alertdialog" + title + description + 两按钮', () => {
      render(
        <ConfirmDialog
          open
          onClose={() => {}}
          onConfirm={() => {}}
          title="删除会话?"
          description="此操作不可恢复,删除后无法找回对话记录。"
          confirmLabel="删除"
          cancelLabel="取消"
          variant="danger"
        />,
      );

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toBeInTheDocument();

      expect(screen.getByText('删除会话?')).toBeInTheDocument();
      expect(screen.getByText(/此操作不可恢复/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    });

    it('Then: 点取消 → 触发 onClose;点确认 → 触发 onConfirm', () => {
      let closeCount = 0;
      let confirmCount = 0;

      render(
        <ConfirmDialog
          open
          onClose={() => {
            closeCount += 1;
          }}
          onConfirm={() => {
            confirmCount += 1;
          }}
          title="结束本次咨询?"
          description="结束后客服将无法继续回复您本次的问题。"
          confirmLabel="结束"
          cancelLabel="取消"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '取消' }));
      expect(closeCount).toBe(1);
      expect(confirmCount).toBe(0);

      fireEvent.click(screen.getByRole('button', { name: '结束' }));
      expect(confirmCount).toBe(1);
    });

    it('Then: open=false → 不渲染 dialog(避免闲时挂载)', () => {
      const { container } = render(
        <ConfirmDialog
          open={false}
          onClose={() => {}}
          onConfirm={() => {}}
          title="不会显示"
          description="n/a"
          confirmLabel="OK"
          cancelLabel="取消"
        />,
      );
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(container.firstChild).toBeNull();
    });

    it('Then: busy=true → 确认 + 取消按钮都 disabled(防请求中误关)', () => {
      render(
        <ConfirmDialog
          open
          onClose={() => {}}
          onConfirm={() => {}}
          title="结束对话"
          description="处理中..."
          confirmLabel="处理中..."
          cancelLabel="取消"
          busy
        />,
      );

      const confirmBtn = screen.getByRole('button', { name: '处理中...' });
      const cancelBtn = screen.getByRole('button', { name: '取消' });
      expect(confirmBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();
    });
  });
});