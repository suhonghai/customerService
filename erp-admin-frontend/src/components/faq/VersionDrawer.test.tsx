import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionDrawer } from './VersionDrawer';
import type { FAQ } from '@/hooks/use-faqs';

const seed: FAQ = {
  id: 1,
  title: '退款流程',
  category: '售后',
  tags: '退款,发票',
  currentVersion: 2,
  status: 2,
  createdAt: '2026-07-16T10:00:00.000Z',
  versions: [
    {
      id: 11,
      version: 2,
      changelog: '增加运费规则说明',
      createdAt: '2026-07-16T11:00:00.000Z',
      creatorName: 'Alice',
    },
    {
      id: 10,
      version: 1,
      changelog: '初稿',
      createdAt: '2026-07-15T10:00:00.000Z',
      creatorName: 'Bob',
    },
  ],
};

describe('<VersionDrawer />', () => {
  it('renders title + descriptions + versions timeline', () => {
    render(<VersionDrawer open faq={seed} onClose={() => {}} />);
    expect(screen.getByText('退款流程')).toBeTruthy();
    expect(screen.getByText('售后')).toBeTruthy();
    expect(screen.getByText('退款,发票')).toBeTruthy();
    expect(screen.queryAllByText('v2').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('v1').length).toBeGreaterThanOrEqual(1);
    // creatorName 跟版本号渲染在同一 div 里,可能被 antd Timeline 拆分;直接对 document.body grep
    const html = document.body.textContent || '';
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('增加运费规则说明');
    expect(html).toContain('初稿');
  });

  it('renders 暂无版本历史 when versions is empty', () => {
    render(<VersionDrawer open faq={{ ...seed, versions: [] }} onClose={() => {}} />);
    expect(screen.getByText('暂无版本历史')).toBeTruthy();
  });

  it('renders 暂无版本历史 when versions is undefined', () => {
    const { versions, ...rest } = seed;
    void versions;
    render(<VersionDrawer open faq={rest} onClose={() => {}} />);
    expect(screen.getByText('暂无版本历史')).toBeTruthy();
  });

  it('renders - for missing category / tags', () => {
    render(
      <VersionDrawer
        open
        faq={{ ...seed, category: undefined, tags: undefined }}
        onClose={() => {}}
      />,
    );
    // 多个 - 单元格(分类 / 标签缺省都展示 -)
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('uses 已发布 tag for status 2', () => {
    render(<VersionDrawer open faq={seed} onClose={() => {}} />);
    expect(screen.getByText('已发布')).toBeTruthy();
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<VersionDrawer open faq={seed} onClose={onClose} />);
    const close = document.body.querySelector('.ant-drawer-close') as HTMLElement | null;
    if (close) await user.click(close);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when faq is null (no crash)', () => {
    render(<VersionDrawer open faq={null} onClose={() => {}} />);
    // 抽屉标题为空;正文不渲染(因为 !faq)
    expect(screen.queryByText('退款流程')).toBeNull();
  });
});
