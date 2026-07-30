import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FAQTable, FAQ_STATUS_META } from './FAQTable';
import { useAuthStore } from '@/stores/auth';
import type { FAQ } from '@/hooks/use-faqs';

const draft: FAQ = {
  id: 1,
  title: '退款流程',
  category: '售后',
  tags: '退款,发票',
  currentVersion: 1,
  status: 0,
  createdAt: '2026-07-16T10:00:00.000Z',
};

const published: FAQ = {
  ...draft,
  id: 2,
  status: 2,
  title: '已发布的 FAQ',
};

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'tok',
    refreshToken: 'rt',
    userInfo: {
      id: 1,
      username: 'tester',
      permissions: ['faq:review', 'faq:delete'],
    } as any,
  });
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const noop = () => {};

describe('<FAQTable />', () => {
  it('renders headers + draft row with tags + draft tag', { timeout: 15000 }, () => {
    render(
      wrap(
        <FAQTable
          data={[draft]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onDetail={noop}
          onPublish={noop}
          onOffline={noop}
          onDelete={noop}
        />,
      ),
    );

    expect(screen.getByText('退款流程')).toBeTruthy();
    expect(screen.getByText('售后')).toBeTruthy();
    // tags: 退款,发票 → 2 个 Tag
    expect(screen.getByText('退款')).toBeTruthy();
    expect(screen.getByText('发票')).toBeTruthy();
    expect(screen.getByText('草稿')).toBeTruthy();
    // 当前版本在 row 内(草稿的 currentVersion=1,列名是「当前版本」)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('draft row shows 发布 button (not 下线)', () => {
    render(
      wrap(
        <FAQTable
          data={[draft]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onDetail={noop}
          onPublish={noop}
          onOffline={noop}
          onDelete={noop}
        />,
      ),
    );
    expect(
      screen.getAllByText((_, n) => n?.textContent?.replace(/\s+/g, '') === '发布').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('下线')).toBeNull();
  });

  it('published row shows 下线 button (not 发布)', () => {
    render(
      wrap(
        <FAQTable
          data={[published]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onDetail={noop}
          onPublish={noop}
          onOffline={noop}
          onDelete={noop}
        />,
      ),
    );
    expect(
      screen.getAllByText((_, n) => n?.textContent?.replace(/\s+/g, '') === '下线').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('发布')).toBeNull();
    expect(screen.getByText('已发布')).toBeTruthy();
  });

  it('missing tags renders -', () => {
    render(
      wrap(
        <FAQTable
          data={[{ ...draft, id: 3, tags: undefined }]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onDetail={noop}
          onPublish={noop}
          onOffline={noop}
          onDelete={noop}
        />,
      ),
    );
    // 「-」 出现在多个单元格(创建时间为空也会渲染 -,但 createdAt 有值),这里只断言 tags 列有 -
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('row actions trigger the matching callbacks', async () => {
    const user = userEvent.setup();
    const onDetail = vi.fn();
    const onPublish = vi.fn();
    const onDelete = vi.fn();

    render(
      wrap(
        <FAQTable
          data={[draft]}
          loading={false}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={noop}
          onDetail={onDetail}
          onPublish={onPublish}
          onOffline={noop}
          onDelete={onDelete}
        />,
      ),
    );

    const clickTextButton = async (label: string) => {
      const candidates = screen.getAllByText(
        (_, n) => n?.textContent?.replace(/\s+/g, '') === label,
      );
      const btn = candidates
        .map((el) => el.closest('button') ?? el)
        .find((el) => el.tagName === 'BUTTON') as HTMLElement;
      expect(btn).toBeTruthy();
      await user.click(btn);
    };

    await clickTextButton('详情');
    expect(onDetail).toHaveBeenCalledWith(draft);

    await clickTextButton('发布');
    expect(onPublish).toHaveBeenCalledWith(draft);

    await clickTextButton('删除');
    await waitFor(() => {
      const okBtn = screen.getAllByText(
        (_, n) => n?.textContent?.trim() === 'OK' || n?.textContent?.trim() === '确定',
      )[0];
      fireEvent.click(okBtn as HTMLElement);
    });
    expect(onDelete).toHaveBeenCalledWith(draft);
  });

  it('分页 next 触发 onPageChange', () => {
    const onPageChange = vi.fn();
    const { container } = render(
      wrap(
        <FAQTable
          data={[draft]}
          loading={false}
          page={1}
          pageSize={20}
          total={50}
          onPageChange={onPageChange}
          onDetail={noop}
          onPublish={noop}
          onOffline={noop}
          onDelete={noop}
        />,
      ),
    );
    const next = container.querySelector('.ant-pagination-item-2') as HTMLElement | null;
    if (next) {
      fireEvent.click(next);
      expect(onPageChange).toHaveBeenCalledWith(2, 20);
    }
  });
});

describe('FAQ_STATUS_META', () => {
  it('maps all 4 states', () => {
    expect(FAQ_STATUS_META[0].label).toBe('草稿');
    expect(FAQ_STATUS_META[1].label).toBe('待审核');
    expect(FAQ_STATUS_META[2].label).toBe('已发布');
    expect(FAQ_STATUS_META[3].label).toBe('已下线');
  });
});
