import { Drawer, Menu, Spin, type MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import type { MenuNode } from '@/stores/menu';
import { toMenuItems } from './AppSider';

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  tree: MenuNode[] | undefined;
  isLoading: boolean;
  selectedKey: string;
}

export function MobileDrawer({ open, onClose, tree, isLoading, selectedKey }: MobileDrawerProps) {
  const navigate = useNavigate();
  const items = useMemo<MenuProps['items']>(() => (tree ? toMenuItems(tree) : []), [tree]);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (typeof key === 'string' && key.startsWith('/')) {
      navigate(key);
    }
  };

  return (
    <Drawer
      title={
        <span className="brand-mark">
          W11<span className="amp">&amp;</span>
          <span>ERP</span>
        </span>
      }
      placement="left"
      open={open}
      onClose={onClose}
      width={280}
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
    >
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
          style={{ borderRight: 0 }}
        />
      )}
    </Drawer>
  );
}
