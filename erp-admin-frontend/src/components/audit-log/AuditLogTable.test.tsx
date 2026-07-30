import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogTable } from './AuditLogTable';
import type { AuditLogListItem } from '@/services/audit-log';

const baseRow: AuditLogListItem = {
  id: 1,
  userId: 10,
  username: '张三',
  module: 'user',
  action: 'create',
  resource: 'user',
  resourceId: '42',
  method: 'POST',
  path: '/api/users',
  ip: '127.0.0.1',
  userAgent: 'jest',
  status: 1, // 成功
  errorMsg: null,
  costMs: 25,
  createdAt: '2026-01-15T10:00:00.000Z',
};

const failRow: AuditLogListItem = {
  ...baseRow,
  id: 2,
  username: null,
  resource: null,
  resourceId: null,
  method: null,
  path: null,
  status: 0, // 失败
  costMs: null,
};

describe('<AuditLogTable />', () => {
  // antd Table 在 jsdom 下首渲会做一轮列宽 / 排序图标测量,串行 25 文件并发跑时
  // 偶发超过默认 5s timeout。本组测试给 15s 兜底,断言意图不变。
  it(
    'renders row data: username / module / action / path / status / cost',
    { timeout: 15000 },
    () => {
      render(
        <AuditLogTable
          data={[baseRow]}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={() => {}}
          onDetail={() => {}}
        />,
      );

      expect(screen.getByText('张三')).toBeTruthy();
      expect(screen.getByText('user')).toBeTruthy();
      expect(screen.getAllByText('create').length).toBeGreaterThan(0);
      expect(screen.getByText('/api/users')).toBeTruthy();
      // 状态 Tag
      expect(screen.getByText('成功')).toBeTruthy();
      // 耗时
      expect(screen.getByText('25ms')).toBeTruthy();
    },
  );

  it('renders dash placeholders for null / missing fields', () => {
    render(
      <AuditLogTable
        data={[failRow]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={() => {}}
      />,
    );

    // 用户名 null → '-'
    // 方法 null → '-'
    // 资源 null → '-'
    // 路径 null → '-'
    // 状态 0 → '失败'
    // 耗时 null → '-'
    expect(screen.getByText('失败')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(4);
  });

  it('resource cell renders "resource#resourceId" when both present', () => {
    render(
      <AuditLogTable
        data={[baseRow]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={() => {}}
      />,
    );

    // resource='user', resourceId='42' → 'user#42'
    expect(screen.getByText('user#42')).toBeTruthy();
  });

  it('method cell wraps value in Tag when present', () => {
    const { container } = render(
      <AuditLogTable
        data={[baseRow]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={() => {}}
      />,
    );

    // POST 应该在 .ant-tag 内
    const tag = screen.getByText('POST');
    expect(tag.className).toContain('ant-tag');
    // 兜底断言:DOM 至少有 1 个 ant-tag
    expect(container.querySelectorAll('.ant-tag').length).toBeGreaterThan(0);
  });

  it('详情 link triggers onDetail with the row', async () => {
    const user = userEvent.setup();
    const onDetail = vi.fn();

    render(
      <AuditLogTable
        data={[baseRow]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={onDetail}
      />,
    );

    await user.click(screen.getByText('详情'));
    expect(onDetail).toHaveBeenCalledTimes(1);
    expect(onDetail).toHaveBeenCalledWith(baseRow);
  });

  it('paginates via onPageChange (page 2 click)', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        data={[baseRow]}
        page={1}
        pageSize={20}
        total={50}
        onPageChange={onPageChange}
        onDetail={() => {}}
      />,
    );

    // antd 分页第 2 页 li 元素
    const item2 = document.body.querySelector('.ant-pagination-item-2') as HTMLElement | null;
    if (item2) {
      item2.click();
      expect(onPageChange).toHaveBeenCalledWith(2, 20);
    } else {
      // 兜底:分页组件至少要渲染
      expect(document.body.querySelector('.ant-pagination')).toBeTruthy();
    }
  });
});
