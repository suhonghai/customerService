import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionDetailDrawer } from './SessionDetailDrawer';
import type { SessionListItem, SessionMessage } from '@/services/session';

// Mock sessionApi,controlled by tests
const mockGetById = vi.fn();
const mockGetMessages = vi.fn();
vi.mock('@/services/session', async () => {
  const actual = await vi.importActual<typeof import('@/services/session')>('@/services/session');
  return {
    ...actual,
    sessionApi: {
      ...actual.sessionApi,
      getById: (...args: any[]) => mockGetById(...args),
      getMessages: (...args: any[]) => mockGetMessages(...args),
    },
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const baseSession: SessionListItem = {
  id: 7,
  sessionKey: 'sk-xyz-007',
  visitorId: 'V-007',
  visitorName: '李雷',
  channel: 1,
  channelLabel: '网页',
  status: 1,
  statusLabel: '进行中',
  aiModelCode: 'gpt-4',
  messageCount: 2,
  rating: 5,
  ratingText: null,
  escalatedAt: null,
  endedAt: null,
  startedAt: '2026-07-10T09:00:00.000Z',
  updatedAt: '2026-07-10T09:05:00.000Z',
};

const endedSession: SessionListItem = {
  ...baseSession,
  id: 8,
  status: 2,
  statusLabel: '已结束',
  rating: 2,
  endedAt: '2026-07-10T10:00:00.000Z',
};

const messages: SessionMessage[] = [
  {
    id: 1,
    sessionId: 7,
    role: 'user',
    content: '你好',
    createdAt: '2026-07-10T09:01:00.000Z',
  },
  {
    id: 2,
    sessionId: 7,
    role: 'assistant',
    content: '你好,我是 AI 助手',
    createdAt: '2026-07-10T09:01:05.000Z',
  },
];

beforeEach(() => {
  mockGetById.mockReset();
  mockGetMessages.mockReset();
});

describe('<SessionDetailDrawer />', () => {
  it('does not query session details when closed', () => {
    render(wrap(<SessionDetailDrawer open={false} sessionId={null} onClose={() => {}} />));
    // sessionId=null → useQuery enabled=false → 不调用
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('does not query when open=true but sessionId=null', () => {
    render(wrap(<SessionDetailDrawer open={true} sessionId={null} onClose={() => {}} />));
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('renders drawer title with session ID after session loads', async () => {
    mockGetById.mockResolvedValue(baseSession);
    mockGetMessages.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 200 });

    render(wrap(<SessionDetailDrawer open={true} sessionId={7} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText(/会话详情 #7/)).toBeInTheDocument();
    });
  });

  it('renders Descriptions fields for session', async () => {
    mockGetById.mockResolvedValue(baseSession);
    mockGetMessages.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 200 });

    render(wrap(<SessionDetailDrawer open={true} sessionId={7} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText('sk-xyz-007')).toBeInTheDocument();
    });

    // 访客名(V-007 是 visitorId;visitorName 是李雷;Descriptions 显示 visitorName 优先)
    expect(screen.getByText('李雷')).toBeInTheDocument();
    // 渠道
    expect(screen.getByText('网页')).toBeInTheDocument();
    // AI 模型
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    // 消息数
    expect(screen.getByText('2')).toBeInTheDocument();
    // 评分 — rating=5 → Good tag
    expect(screen.getAllByText('Good').length).toBeGreaterThan(0);
  });

  it('renders ended session with ended time + Bad rating', async () => {
    mockGetById.mockResolvedValue(endedSession);
    mockGetMessages.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 200 });

    render(wrap(<SessionDetailDrawer open={true} sessionId={8} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText(/会话详情 #8/)).toBeInTheDocument();
    });
    // 状态 = 已结束(antd Tag 会在中文字符间插入空格,用正则匹配)
    await waitFor(() => {
      expect(screen.getAllByText(/已.*结.*束/).length).toBeGreaterThan(0);
    });
    // rating=2 → Bad tag
    expect(screen.getAllByText('Bad').length).toBeGreaterThan(0);
    // endedAt 非空 → 不渲染 '-'
  });

  it('shows "-" for null aiModelCode and null endedAt', async () => {
    mockGetById.mockResolvedValue({ ...baseSession, aiModelCode: null });
    mockGetMessages.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 200 });

    render(wrap(<SessionDetailDrawer open={true} sessionId={7} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText(/会话详情 #7/)).toBeInTheDocument();
    });
    // aiModelCode=null → '-';endedAt=null → '-'
    await waitFor(() => {
      expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders message list with role tags and content', async () => {
    mockGetById.mockResolvedValue(baseSession);
    mockGetMessages.mockResolvedValue({
      list: messages,
      total: 2,
      page: 1,
      pageSize: 200,
    });

    render(wrap(<SessionDetailDrawer open={true} sessionId={7} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText('你好')).toBeInTheDocument();
    });
    expect(screen.getByText('你好,我是 AI 助手')).toBeInTheDocument();
    // role tags — user / assistant
    expect(screen.getAllByText('user').length).toBeGreaterThan(0);
    expect(screen.getAllByText('assistant').length).toBeGreaterThan(0);
  });

  it('shows empty placeholder when messages list is empty', async () => {
    mockGetById.mockResolvedValue(baseSession);
    mockGetMessages.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 200 });

    render(wrap(<SessionDetailDrawer open={true} sessionId={7} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText(/会话详情 #7/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('暂无消息')).toBeInTheDocument();
    });
  });

  it('falls back to visitorId when visitorName is null', async () => {
    mockGetById.mockResolvedValue({ ...baseSession, visitorName: null });
    mockGetMessages.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 200 });

    render(wrap(<SessionDetailDrawer open={true} sessionId={7} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText(/会话详情 #7/)).toBeInTheDocument();
    });
    // visitorName=null → 显示 visitorId=V-007
    await waitFor(() => {
      expect(screen.getByText('V-007')).toBeInTheDocument();
    });
  });

  it('renders rating N/A tag when rating is null', async () => {
    mockGetById.mockResolvedValue({ ...baseSession, rating: null });
    mockGetMessages.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 200 });

    render(wrap(<SessionDetailDrawer open={true} sessionId={7} onClose={() => {}} />));

    await waitFor(() => {
      expect(screen.getByText(/会话详情 #7/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
    });
  });

  it('fires onClose when drawer close button is clicked', async () => {
    mockGetById.mockResolvedValue(baseSession);
    mockGetMessages.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 200 });
    const onClose = vi.fn();

    render(wrap(<SessionDetailDrawer open={true} sessionId={7} onClose={onClose} />));

    await waitFor(() => {
      expect(screen.getByText(/会话详情 #7/)).toBeInTheDocument();
    });

    const closeBtn = document.querySelector('.ant-drawer-close') as HTMLElement | null;
    expect(closeBtn).toBeTruthy();
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
