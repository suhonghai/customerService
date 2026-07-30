import { Layout, Menu, Spin, type MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import * as AntdIcons from '@ant-design/icons';
import type { MenuNode } from '@/stores/menu';

const { Sider } = Layout;

/**
 * 动态图标解析:从 seed 里存的 Antd icon 名字(如 'DashboardOutlined')
 * 动态查找 @ant-design/icons 导出的组件。
 * 用 namespace import 避免手动列每个图标(20+ 种)。
 */
function resolveIcon(name?: string | null): React.ReactNode {
  if (!name) return undefined;
  const Icons = AntdIcons as unknown as Record<string, React.ComponentType<any>>;
  const Comp = Icons[name];
  return Comp ? <Comp /> : undefined;
}

export function toMenuItems(nodes: MenuNode[]): MenuProps['items'] {
  return nodes
    .filter((n) => (n.type === 1 || n.type === 2) && n.visible !== false)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((n) => {
      const icon = resolveIcon(n.icon);
      const children = n.children ? toMenuItems(n.children) : undefined;
      const item: NonNullable<MenuProps['items']>[number] = {
        key: n.path || `menu-${n.id}`,
        icon,
        label: n.name,
      };
      if (children && children.length > 0) {
        (item as { children?: MenuProps['items'] }).children = children;
      }
      return item;
    });
}

export function findFirstPath(nodes: MenuNode[]): string | undefined {
  for (const n of nodes) {
    if (n.type === 2 && n.path) return n.path;
    if (n.children) {
      const p = findFirstPath(n.children);
      if (p) return p;
    }
  }
  return undefined;
}

export interface AppSiderProps {
  tree: MenuNode[] | undefined;
  isLoading: boolean;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  selectedKey: string;
}

export function AppSider({ tree, isLoading, collapsed, onCollapse, selectedKey }: AppSiderProps) {
  const navigate = useNavigate();
  const items = useMemo<MenuProps['items']>(() => (tree ? toMenuItems(tree) : []), [tree]);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (typeof key === 'string' && key.startsWith('/')) {
      navigate(key);
    }
  };

  return (
    <Sider
      width={232}
      collapsedWidth={64}
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      trigger={null}
      style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}
    >
      <div
        style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 0 : '0 24px',
          borderBottom: '1px solid var(--border-thin)',
          background: 'var(--bg-canvas)',
        }}
      >
        {collapsed ? (
          <span className="brand-mark">
            W<span className="amp">&</span>
          </span>
        ) : (
          <span className="brand-mark">
            W11<span className="amp">&amp;</span>
            <span>ERP</span>
            <span className="sub">v0.1</span>
          </span>
        )}
      </div>
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : (
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          onClick={handleMenuClick}
          style={{ borderRight: 0, paddingTop: 12, background: 'transparent' }}
        />
      )}
      <div
        onClick={() => onCollapse(!collapsed)}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '14px 0',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          borderTop: '1px solid var(--border-thin)',
          userSelect: 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
      >
        {collapsed ? '»' : '« collapse'}
      </div>
    </Sider>
  );
}
