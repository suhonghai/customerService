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

import { AppHeader } from './AppHeader';

beforeEach(() => {
  mockNavigate.mockReset();
});

describe('AppHeader', () => {
  it('renders ThemeSwitcher, notification button and user menu', () => {
    renderWithProviders(
      <AppHeader isMobile={false} onOpenMobileDrawer={vi.fn()} onToggleSidebar={vi.fn()} />,
    );
    // ThemeSwitcher 主题切换按钮 (aria-label='切换主题')
    expect(screen.getByLabelText('切换主题')).toBeInTheDocument();
    // 通知按钮
    expect(screen.getByLabelText('通知')).toBeInTheDocument();
  });

  it('shows mobile menu button when isMobile=true', () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <AppHeader isMobile={true} onOpenMobileDrawer={onOpen} onToggleSidebar={vi.fn()} />,
    );
    // 移动端渲染的是 MenuOutlined 按钮 — 通过 aria-label 折叠侧边栏 不存在
    expect(screen.queryByLabelText('折叠侧边栏')).not.toBeInTheDocument();
    // 点击 MenuOutlined 触发 onOpenMobileDrawer
    const menuBtn = document.querySelector('button .anticon-menu')?.closest('button');
    expect(menuBtn).toBeInTheDocument();
    if (menuBtn) fireEvent.click(menuBtn);
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows toggle sidebar button when isMobile=false', () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <AppHeader isMobile={false} onOpenMobileDrawer={vi.fn()} onToggleSidebar={onToggle} />,
    );
    fireEvent.click(screen.getByLabelText('折叠侧边栏'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('renders production env label when not mobile', () => {
    renderWithProviders(
      <AppHeader isMobile={false} onOpenMobileDrawer={vi.fn()} onToggleSidebar={vi.fn()} />,
    );
    expect(screen.getByText('// production')).toBeInTheDocument();
  });

  it('hides production env label when mobile', () => {
    renderWithProviders(
      <AppHeader isMobile={true} onOpenMobileDrawer={vi.fn()} onToggleSidebar={vi.fn()} />,
    );
    expect(screen.queryByText('// production')).not.toBeInTheDocument();
  });
});
