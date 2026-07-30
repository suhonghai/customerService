import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const mockNavigate = vi.hoisted(() => vi.fn<(path: string) => void>());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import type { MenuNode } from '@/stores/menu';
import { MobileDrawer } from './MobileDrawer';

const fakeTree: MenuNode[] = [
  {
    id: 1,
    parentId: null,
    name: '数据看板',
    path: '/stats',
    component: null,
    icon: null,
    type: 2,
    permCode: null,
    sort: 0,
    visible: true,
  },
];

beforeEach(() => {
  mockNavigate.mockReset();
});

describe('MobileDrawer', () => {
  it('renders menu items when open and tree provided', () => {
    renderWithProviders(
      <MobileDrawer
        open={true}
        onClose={vi.fn()}
        tree={fakeTree}
        isLoading={false}
        selectedKey="/stats"
      />,
    );
    expect(screen.getByText('数据看板')).toBeInTheDocument();
  });

  it('navigates when menu item clicked', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <MobileDrawer
        open={true}
        onClose={onClose}
        tree={fakeTree}
        isLoading={false}
        selectedKey="/stats"
      />,
    );
    fireEvent.click(screen.getByText('数据看板'));
    expect(mockNavigate).toHaveBeenCalledWith('/stats');
  });

  it('shows loading spinner when isLoading', () => {
    const { baseElement } = renderWithProviders(
      <MobileDrawer
        open={true}
        onClose={vi.fn()}
        tree={undefined}
        isLoading={true}
        selectedKey="/"
      />,
    );
    // antd Drawer 在 jsdom 下 body 通过 portal 挂到 document.body
    expect(baseElement.querySelector('.ant-spin')).toBeInTheDocument();
  });
});
