import type { MenuNode } from '@/stores/menu';
import { TYPE_LABEL } from './menu-constants';

/**
 * 把菜单树扁平化为父级 Select 选项。
 *
 * - 每深入一级在 label 前加两个空格作为缩进提示
 * - 节点 name 后追加 `(类型)`(复用 TYPE_LABEL)
 * - 返回 [{ value: id, label: '  ' + name + ' (目录)' }, ...]
 *
 * @param menus 菜单树(顶层节点数组)
 * @param depth 当前递归深度,默认 0
 */
export function flattenForParentSelect(
  menus: MenuNode[],
  depth = 0,
): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (const m of menus) {
    out.push({
      value: m.id,
      label: `${'  '.repeat(depth)}${m.name} (${TYPE_LABEL[m.type] || '-'})`,
    });
    if (m.children?.length) {
      out.push(...flattenForParentSelect(m.children, depth + 1));
    }
  }
  return out;
}

/**
 * 把"菜单树"组装成"父级 Select 完整 options":
 *   - 第 0 项固定为 { value: null, label: '顶层' }(表示无父级)
 *   - 之后拼 flattenForParentSelect(tree) 结果
 */
export function buildParentOptions(
  tree: MenuNode[] | undefined,
): { value: number | null; label: string }[] {
  return [{ value: null, label: '顶层' }, ...flattenForParentSelect(tree || [])];
}
