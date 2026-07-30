import { describe, it, expect } from 'vitest';
import { buildTreeData, collectCheckedKeys, type TreeMenuNode } from './role-utils';
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
        icon: null,
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
      },
    ],
  },
];

describe('buildTreeData', () => {
  it('maps MenuNode → TreeMenuNode with menuId + key', () => {
    const out = buildTreeData(tree, []);
    expect(out).toHaveLength(1);
    expect(out[0].menuId).toBe(1);
    expect(out[0].key).toBe(1);
    expect(out[0].checkable).toBe(true);
    expect(out[0].checked).toBe(false);
  });

  it('marks checked=true when menuId is in checkedIds', () => {
    const out = buildTreeData(tree, [1, 3]);
    expect(out[0].checked).toBe(true); // id=1
    expect(out[0].children![0].checked).toBe(false); // id=2 未选
    expect(out[0].children![1].checked).toBe(true); // id=3
  });

  it('appends "(按钮)" suffix to title for type=3 (按钮)', () => {
    const out = buildTreeData(tree, []);
    const btn = out[0].children![1];
    expect(btn.title).toBe('新增 (按钮)');
  });

  it('does not append suffix for type=1 (目录) or type=2 (菜单)', () => {
    const out = buildTreeData(tree, []);
    expect(out[0].title).toBe('系统');
    expect(out[0].children![0].title).toBe('用户');
  });

  it('handles empty menu tree', () => {
    expect(buildTreeData([], [])).toEqual([]);
  });

  it('preserves children recursively', () => {
    const out = buildTreeData(tree, []);
    // 顶层系统目录有 2 个 children (用户 / 新增)
    expect(out[0].children).toHaveLength(2);
    // 叶子节点 (无 children) 在 TS 上是 undefined
    expect(out[0].children![0].children).toBeUndefined();
    expect(out[0].children![1].children).toBeUndefined();
  });

  it('recurses into non-empty children (deeply nested)', () => {
    const deepTree: MenuNode[] = [
      {
        id: 100,
        parentId: null,
        name: '根',
        path: '/',
        component: null,
        icon: null,
        type: 1,
        permCode: null,
        sort: 0,
        visible: true,
        children: [
          {
            id: 101,
            parentId: 100,
            name: '子级',
            path: '/child',
            component: null,
            icon: null,
            type: 2,
            permCode: null,
            sort: 0,
            visible: true,
            children: [
              {
                id: 102,
                parentId: 101,
                name: '孙级',
                path: '/gc',
                component: null,
                icon: null,
                type: 2,
                permCode: null,
                sort: 0,
                visible: true,
              },
            ],
          },
        ],
      },
    ];
    const out = buildTreeData(deepTree, [102]);
    expect(out[0].menuId).toBe(100);
    expect(out[0].children).toHaveLength(1);
    expect(out[0].children![0].menuId).toBe(101);
    expect(out[0].children![0].children).toHaveLength(1);
    expect(out[0].children![0].children![0].menuId).toBe(102);
    // 孙级应标记 checked
    expect(out[0].children![0].children![0].checked).toBe(true);
  });
});

describe('collectCheckedKeys', () => {
  it('returns empty when no nodes are checked', () => {
    const nodes: TreeMenuNode[] = buildTreeData(tree, []);
    expect(collectCheckedKeys(nodes)).toEqual([]);
  });

  it('collects all checked menuIds in flat array', () => {
    const nodes: TreeMenuNode[] = buildTreeData(tree, [1, 3]);
    const keys = collectCheckedKeys(nodes);
    expect(keys.sort()).toEqual([1, 3]);
  });

  it('walks children recursively', () => {
    const manual: TreeMenuNode[] = [
      {
        menuId: 10,
        key: 10,
        title: 'A',
        checked: false,
        children: [
          { menuId: 11, key: 11, title: 'A.1', checked: true },
          { menuId: 12, key: 12, title: 'A.2', checked: false },
        ],
      },
    ];
    const keys = collectCheckedKeys(manual);
    expect(keys).toEqual([11]);
  });

  it('handles empty tree', () => {
    expect(collectCheckedKeys([])).toEqual([]);
  });
});
