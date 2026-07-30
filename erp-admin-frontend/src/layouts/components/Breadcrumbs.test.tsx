import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

// module-level 状态 + vi.mock 工厂读取,避免在 mock 函数签名上动手脚
const state = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useLocation: () => ({ pathname: state.pathname, search: '', hash: '', state: null, key: 'k' }),
  };
});

import { Breadcrumbs } from './Breadcrumbs';

function PathProbe() {
  const loc = useLocation();
  return <span data-testid="probe">{loc.pathname}</span>;
}

beforeEach(() => {
  state.pathname = '/';
});

describe('Breadcrumbs', () => {
  it('renders 首页 fallback for root path', () => {
    state.pathname = '/';
    render(
      <MemoryRouter initialEntries={['/']}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    expect(screen.getByText('首页')).toBeInTheDocument();
  });

  it('renders multi-level breadcrumb for /system/user', () => {
    state.pathname = '/system/user';
    render(
      <MemoryRouter initialEntries={['/system/user']}>
        <Breadcrumbs />
        <PathProbe />
      </MemoryRouter>,
    );
    // routeMap '/system/user' → '系统管理 / 用户管理'
    expect(screen.getByText('系统管理')).toBeInTheDocument();
    expect(screen.getByText('用户管理')).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('/system/user');
  });

  it('falls back to path segments when route not mapped', () => {
    state.pathname = '/some/unknown/route';
    render(
      <MemoryRouter initialEntries={['/some/unknown/route']}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    // fallback: split by '/', filter empty
    expect(screen.getByText('some')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.getByText('route')).toBeInTheDocument();
  });
});
