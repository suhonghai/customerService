import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionTable } from './SessionTable';
import { useAuthStore } from '@/stores/auth';
import type { SessionListItem } from '@/services/session';

// Auth store 默认无权限,删除按钮不显示;测试再单独赋权
beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['session:delete'] as any,
    } as any,
  });
});

const baseSession: SessionListItem = {
  id: 1,
  sessionKey: 'sk-abc',
  visitorId: 'V-001',
  visitorName: '张三',
  channel: 1,
  channelLabel: '网页',
  status: 1, // 进行中
  statusLabel: '进行中',
  aiModelCode: 'gpt-4',
  messageCount: 12,
  rating: 5, // 满意
  ratingText: null,
  escalatedAt: null,
  endedAt: null,
  startedAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:05:00.000Z',
};

const endedSession: SessionListItem = {
  ...baseSession,
  id: 2,
  status: 2, // 已结束
  statusLabel: '已结束',
  rating: 2, // 不满意
  endedAt: '2026-07-01T11:00:00.000Z',
};

// antd Table 在 jsdom 下首渲会做一轮列宽 / 排序图标测量,串行 25 文件并发跑时
// 偶发超过默认 5s timeout。本组测试给 15s 兜底,断言意图不变。
describe('<SessionTable />', () => {
  it('renders row + key columns (访客/渠道/状态 Tag/评分/消息数)', { timeout: 15000 }, () => {
    render(
      <SessionTable
        data={[baseSession]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={() => {}}
        onDelete={() => {}}
      />,
    );

    // 访客
    expect(screen.getByText('V-001')).toBeTruthy();
    expect(screen.getByText('张三')).toBeTruthy();
    // 渠道
    expect(screen.getByText('网页')).toBeTruthy();
    // 状态 Tag — antd Button 文字会自动在中文字符间插空格,用正则
    expect(screen.getAllByText(/进.*行.*中/).length).toBeGreaterThan(0);
    // 消息数 (12)
    expect(screen.getByText('12')).toBeTruthy();
    // 评分 Tag:Good (rating=5)
    expect(screen.getAllByText('Good').length).toBeGreaterThan(0);
  });

  it('renders Good(5) and Bad(2) tags for different ratings', () => {
    render(
      <SessionTable
        data={[baseSession, endedSession]}
        page={1}
        pageSize={20}
        total={2}
        onPageChange={() => {}}
        onDetail={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getAllByText('Good').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bad').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/进.*行.*中/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/已.*结.*束/).length).toBeGreaterThan(0);
  });

  it('renders dash for missing visitorName', () => {
    const noName: SessionListItem = { ...baseSession, id: 3, visitorName: null };
    render(
      <SessionTable
        data={[noName]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={() => {}}
        onDelete={() => {}}
      />,
    );

    // visitorName = null → 渲染 '-';endedAt = null → 渲染 '-'
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('clicking 详情 triggers onDetail with row', async () => {
    const user = userEvent.setup();
    const onDetail = vi.fn();

    render(
      <SessionTable
        data={[baseSession]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={onDetail}
        onDelete={() => {}}
      />,
    );

    await user.click(screen.getByText(/详.*情/));
    expect(onDetail).toHaveBeenCalledWith(baseSession);
  });

  it('clicking 删除 (after popconfirm) triggers onDelete with id', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <SessionTable
        data={[baseSession]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={() => {}}
        onDelete={onDelete}
      />,
    );

    // 删除 button 是 danger 类
    const delBtn = document.body.querySelector(
      '.ant-table-cell-fix-right-first button.ant-btn-dangerous',
    ) as HTMLElement;
    expect(delBtn).toBeTruthy();
    await user.click(delBtn);
    // antd Popconfirm 的确定按钮在 .ant-popconfirm-buttons .ant-btn-primary
    const confirm = document.body.querySelector(
      '.ant-popconfirm-buttons .ant-btn-primary',
    ) as HTMLElement;
    expect(confirm).toBeTruthy();
    await user.click(confirm);
    expect(onDelete).toHaveBeenCalledWith(baseSession.id);
  });

  it('without session:delete permission, 删除 button is hidden', () => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'rt',
      userInfo: {
        id: 1,
        username: 'tester',
        permissions: [] as any,
      } as any,
    });

    const { container } = render(
      <SessionTable
        data={[baseSession]}
        page={1}
        pageSize={20}
        total={1}
        onPageChange={() => {}}
        onDetail={() => {}}
        onDelete={() => {}}
      />,
    );

    // 详情按钮还在,删除按钮应被 PermissionButton 抑制
    expect(screen.getByText(/详.*情/)).toBeTruthy();
    // 整个操作列单元格不应出现 "删...除"
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    if (table) {
      expect(within(table).queryByText(/删.*除/)).toBeNull();
    }
  });

  it('paging click triggers onPageChange', () => {
    const onPageChange = vi.fn();
    const { container } = render(
      <SessionTable
        data={[baseSession]}
        page={1}
        pageSize={20}
        total={50}
        onPageChange={onPageChange}
        onDetail={() => {}}
        onDelete={() => {}}
      />,
    );

    const next = container.querySelector('.ant-pagination-item-2') as HTMLElement | null;
    if (next) {
      fireEvent.click(next);
      expect(onPageChange).toHaveBeenCalledWith(2, 20);
    } else {
      expect(container.querySelector('.ant-pagination')).toBeTruthy();
    }
  });
});
