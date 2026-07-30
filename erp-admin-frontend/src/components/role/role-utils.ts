import type { DataNode } from 'antd/es/tree';
import type { MenuNode } from '@/stores/menu';

/**
 * antd Tree 节点扩展 —— 在 DataNode 基础上挂 menuId + checked。
 *
 * - key 使用 menuId 字符串化(Tree 内部唯一标识)
 * - menuId 用于提交时反查选中的菜单 id
 * - checked 表示当前复选框是否被勾选(Tree 的 onCheck 会更新它)
 */
export interface TreeMenuNode extends DataNode {
  menuId: number;
  checked?: boolean;
  children?: TreeMenuNode[];
}

/**
 * 把后端菜单树 + 当前角色已分配的菜单 id 列表 → antd Tree 用的 treeData。
 *
 * - type=3 (按钮) 在 name 后追加 "(按钮)" 提示
 * - 复用递归处理 children(支持多层菜单树)
 */
export function buildTreeData(menus: MenuNode[], checkedIds: number[]): TreeMenuNode[] {
  return menus.map((m) => {
    const node: TreeMenuNode = {
      key: m.id,
      title: m.type === 3 ? `${m.name} (按钮)` : m.name,
      menuId: m.id,
      checkable: true,
      disableCheckbox: false,
      checked: checkedIds.includes(m.id),
    };
    if (m.children && m.children.length) {
      node.children = buildTreeData(m.children, checkedIds);
    }
    return node;
  });
}

/**
 * 从 Tree 节点树里收集所有 checked=true 的 menuId,扁平化为 number[]。
 *
 * - 用闭包 keys 累积,默认从 [] 开始
 * - 跳过未选中的节点(但仍递归 children,因为勾选父级不带勾子级时不会进入子级)
 */
export function collectCheckedKeys(nodes: TreeMenuNode[], keys: number[] = []): number[] {
  for (const n of nodes) {
    if (n.checked) keys.push(n.menuId);
    if (n.children?.length) collectCheckedKeys(n.children as TreeMenuNode[], keys);
  }
  return keys;
}
