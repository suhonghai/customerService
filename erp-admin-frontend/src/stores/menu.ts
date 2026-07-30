import { create } from 'zustand';

export interface MenuNode {
  id: number;
  parentId: number | null;
  name: string;
  path: string | null;
  component: string | null;
  icon: string | null;
  type: 1 | 2 | 3; // 1=目录 2=菜单 3=按钮
  permCode: string | null;
  sort: number;
  visible: boolean;
  status?: number;
  children?: MenuNode[];
}

interface MenuState {
  menus: MenuNode[];
  setMenus: (menus: MenuNode[]) => void;
  clear: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  menus: [],
  setMenus: (menus) => set({ menus }),
  clear: () => set({ menus: [] }),
}));
