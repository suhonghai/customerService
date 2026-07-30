import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogDetailDrawer } from './AuditLogDetailDrawer';
import type { AuditLogDetail } from '@/services/audit-log';

const log: AuditLogDetail = {
  id: 123,
  userId: 7,
  username: 'alice',
  module: 'user',
  action: 'update',
  resource: 'user',
  resourceId: '42',
  method: 'PUT',
  path: '/api/users/42',
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0 (test)',
  status: 1,
  errorMsg: null,
  costMs: 88,
  createdAt: '2026-07-15T08:00:00Z',
  params: { id: 42, name: 'alice' },
  oldValue: { name: 'old-name' },
  newValue: { name: 'new-name' },
};

const failedLog: AuditLogDetail = {
  ...log,
  id: 999,
  status: 0,
  errorMsg: '权限不足',
};

describe('<AuditLogDetailDrawer />', () => {
  it('renders nothing inside drawer body when closed', () => {
    render(
      <AuditLogDetailDrawer
        open={false}
        drawerId={null}
        log={undefined}
        loading={false}
        onClose={() => {}}
      />,
    );
    // antd Drawer closed → 不会 mount 内容
    expect(document.body.querySelector('.ant-drawer-open')).toBeFalsy();
  });

  it('renders drawer title with the ID when open and log loaded', () => {
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={123}
        log={log}
        loading={false}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/审计详情 #123/)).toBeInTheDocument();
  });

  it('shows basic tab content by default — Descriptions fields + status tag', () => {
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={123}
        log={log}
        loading={false}
        onClose={() => {}}
      />,
    );
    // 默认 tab=basic,12 字段 + 状态 Tag
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('update')).toBeInTheDocument(); // action
    // resource + resourceId 是两个独立 Descriptions.Item,分别渲染
    // 'user' 出现多次(module='user' + resource='user'),用 getAllByText
    expect(screen.getAllByText('user').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('42')).toBeInTheDocument(); // resourceId
    expect(screen.getByText('PUT')).toBeInTheDocument(); // method
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument(); // ip
    // 状态 Tag 是 antd preset green,文案 "成功"
    expect(screen.getByText('成功')).toBeInTheDocument();
    // 路径
    expect(screen.getByText('/api/users/42')).toBeInTheDocument();
  });

  it('shows red status tag + errorMsg paragraph for failed log', () => {
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={999}
        log={failedLog}
        loading={false}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('失败')).toBeInTheDocument();
    expect(screen.getByText('权限不足')).toBeInTheDocument();
  });

  it('shows Spin indicator when loading is true', () => {
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={123}
        log={undefined}
        loading={true}
        onClose={() => {}}
      />,
    );
    // Spin 渲染 .ant-spin;log undefined 时 Descriptions 不渲染
    expect(document.body.querySelector('.ant-spin')).toBeTruthy();
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('switches to request tab and renders params JSON', async () => {
    const user = userEvent.setup();
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={123}
        log={log}
        loading={false}
        onClose={() => {}}
      />,
    );
    // 点 "请求信息" tab
    const requestTab = screen.getByRole('tab', { name: /请求信息/ });
    await user.click(requestTab);
    // params JSON 应渲染
    expect(screen.getByText(/"id": 42/)).toBeInTheDocument();
    expect(screen.getByText(/"name": "alice"/)).toBeInTheDocument();
  });

  it('switches to diff tab and renders oldValue + newValue JSON', async () => {
    const user = userEvent.setup();
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={123}
        log={log}
        loading={false}
        onClose={() => {}}
      />,
    );
    // 点 "变更对比" tab
    const diffTab = screen.getByRole('tab', { name: /变更对比/ });
    await user.click(diffTab);
    expect(screen.getByText(/"name": "old-name"/)).toBeInTheDocument();
    expect(screen.getByText(/"name": "new-name"/)).toBeInTheDocument();
  });

  it('renders "无" placeholder for null params/oldValue/newValue', async () => {
    const nullLog: AuditLogDetail = {
      ...log,
      params: null,
      oldValue: null,
      newValue: undefined,
    };
    const user = userEvent.setup();
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={123}
        log={nullLog}
        loading={false}
        onClose={() => {}}
      />,
    );
    // request tab
    await user.click(screen.getByRole('tab', { name: /请求信息/ }));
    // fmtJson(null) === '无';fmtJson(undefined) === '无'
    const allNone = screen.getAllByText('无');
    expect(allNone.length).toBeGreaterThanOrEqual(1);

    // diff tab
    await user.click(screen.getByRole('tab', { name: /变更对比/ }));
    expect(screen.getAllByText('无').length).toBeGreaterThanOrEqual(3);
  });

  it('fires onClose when drawer close button clicked', () => {
    const onClose = vi.fn();
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={123}
        log={log}
        loading={false}
        onClose={onClose}
      />,
    );
    // antd Drawer 的 X 关闭按钮有 .ant-drawer-close
    const closeBtn = document.querySelector('.ant-drawer-close') as HTMLElement | null;
    expect(closeBtn).toBeTruthy();
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('renders "-" placeholders for optional fields when log is sparse', async () => {
    const sparse: AuditLogDetail = {
      ...log,
      username: null,
      resourceId: null,
      method: null,
      ip: null,
      userAgent: null,
      costMs: null,
      path: null,
    };
    const user = userEvent.setup();
    render(
      <AuditLogDetailDrawer
        open={true}
        drawerId={123}
        log={sparse}
        loading={false}
        onClose={() => {}}
      />,
    );
    // 默认 basic tab:username/resourceId/method/costMs/ip/path 共 6 个 '-'
    // (userId=7 仍然渲染 '7',不计入)
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(6);

    // request tab:HTTP 方法 / 路径 / IP / UA / 耗时 — 5 个 '-' 字段
    await user.click(screen.getByRole('tab', { name: /请求信息/ }));
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(11);
  });
});
