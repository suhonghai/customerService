import { describe, it, expect } from 'vitest';
import { flattenForParentSelect, buildParentOptions } from './menu-utils';
import type { MenuNode } from '@/stores/menu';

const tree: MenuNode[] = [
  {
    id: 1,
    parentId: null,
    name: '系统',
    path: '/system',
    component: null,
    icon: null,
    type: 1,
    permCode: null,
    sort: 0,
    visible: true,
    children: [
      {
        id: 2,
        parentId: 1,
        name: '用户',
        path: '/system/user',
        component: 'system/User/index',
        icon: 'UserOutlined',
        type: 2,
        permCode: null,
        sort: 0,
        visible: true,
        children: [],
      },
      {
        id: 3,
        parentId: 1,
        name: '新增',
        path: null,
        component: null,
        icon: null,
        type: 3,
        permCode: 'user:create',
        sort: 0,
        visible: true,
        children: [],
      },
    ],
  },
];

describe('flattenForParentSelect', () => {
  it('flattens tree with depth-based indentation and type label', () => {
    const out = flattenForParentSelect(tree);
    expect(out).toEqual([
      { value: 1, label: '系统 (目录)' },
      { value: 2, label: '  用户 (菜单)' },
      { value: 3, label: '  新增 (按钮)' },
    ]);
  });

  it('handles single-level tree (no children)', () => {
    const flat: MenuNode[] = [
      {
        id: 10,
        parentId: null,
        name: 'A',
        path: null,
        component: null,
        icon: null,
        type: 2,
        permCode: null,
        sort: 0,
        visible: true,
      },
    ];
    const out = flattenForParentSelect(flat);
    expect(out).toEqual([{ value: 10, label: 'A (菜单)' }]);
  });

  it('falls back to "-" when type label is missing', () => {
    const odd: MenuNode[] = [
      {
        id: 99,
        parentId: null,
        name: 'Mystery',
        path: null,
        component: null,
        icon: null,
        type: 99 as unknown as 1, // 故意放一个 TYPE_LABEL 没有的类型
        permCode: null,
        sort: 0,
        visible: true,
      },
    ];
    const out = flattenForParentSelect(odd);
    expect(out[0].label).toBe('Mystery (-)');
  });

  it('returns empty array for empty tree', () => {
    expect(flattenForParentSelect([])).toEqual([]);
  });
});

describe('buildParentOptions', () => {
  it('prepends 顶层 option and flattens tree', () => {
    const out = buildParentOptions(tree);
    expect(out[0]).toEqual({ value: null, label: '顶层' });
    expect(out).toHaveLength(4); // 顶层 + 3 个树节点
    expect(out[1]).toEqual({ value: 1, label: '系统 (目录)' });
    expect(out[3]).toEqual({ value: 3, label: '  新增 (按钮)' });
  });

  it('returns only 顶层 when tree is undefined or empty', () => {
    expect(buildParentOptions(undefined)).toEqual([{ value: null, label: '顶层' }]);
    expect(buildParentOptions([])).toEqual([{ value: null, label: '顶层' }]);
  });
});
