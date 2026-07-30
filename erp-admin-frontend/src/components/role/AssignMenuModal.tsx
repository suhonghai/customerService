import { useEffect, useState } from 'react';
import { message, Modal, Tree } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { assignMenus, getRoleMenus } from '@/services/role';
import { fetchMenuTree } from '@/services/menu';
import type { RoleListItem } from '@/services/role';
import { buildTreeData, collectCheckedKeys, type TreeMenuNode } from './role-utils';

export interface AssignMenuModalProps {
  open: boolean;
  role: RoleListItem | null;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * 角色分配菜单 Modal —— Tree 复选框 + 加载态 + 提交。
 *
 * - 内部拉取菜单树 (useQuery fetchMenuTree) + 当前角色的菜单 id 列表 (useEffect + getRoleMenus)
 * - 选中节点用 buildTreeData → TreeMenuNode.checked 标记,提交时 collectCheckedKeys 收集
 * - onCheck 时同步更新本地 tree 状态(用 info.checkedNodes 重新计算 checked)
 * - 提交按钮 confirmLoading 由 assignMut.isPending 控制
 * - 关闭/成功后清空本地 tree 状态,避免下次打开残留旧数据
 */
export function AssignMenuModal({ open, role, onClose, onSuccess }: AssignMenuModalProps) {
  const [assignTree, setAssignTree] = useState<TreeMenuNode[]>([]);

  const menusQ = useQuery({
    queryKey: ['menus', 'tree'],
    queryFn: () => fetchMenuTree(),
    enabled: open,
  });

  // 加载"分配菜单"弹窗数据 — 菜单树就绪后请求该角色已分配的菜单 id
  useEffect(() => {
    if (!open || !role || !menusQ.data) return;
    let cancelled = false;
    getRoleMenus(role.id)
      .then((ids) => {
        if (cancelled) return;
        setAssignTree(buildTreeData(menusQ.data, ids));
      })
      .catch((e: Error) => message.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, role, menusQ.data]);

  // 关闭时清空 tree,避免下次打开残留旧数据
  useEffect(() => {
    if (!open) setAssignTree([]);
  }, [open]);

  const assignMut = useMutation({
    mutationFn: ({ id, menuIds }: { id: number; menuIds: number[] }) => assignMenus(id, menuIds),
    onSuccess: () => {
      message.success('分配菜单成功');
      onSuccess?.();
      onClose();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const onAssignSubmit = () => {
    if (!role) return;
    const ids = collectCheckedKeys(assignTree);
    assignMut.mutate({ id: role.id, menuIds: ids });
  };

  return (
    <Modal
      title={role ? `分配菜单 - ${role.name}` : '分配菜单'}
      open={open}
      onCancel={onClose}
      onOk={onAssignSubmit}
      confirmLoading={assignMut.isPending}
      width={520}
      destroyOnHidden
    >
      {menusQ.isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>加载菜单…</div>
      ) : (
        <Tree
          treeData={assignTree}
          checkable
          defaultExpandAll
          onCheck={(_, info) => {
            const checkedNodes = info.checkedNodes as TreeMenuNode[];
            const next = assignTree.map((top) => {
              const find = (n: TreeMenuNode): TreeMenuNode => {
                const found = checkedNodes.find((c) => c.menuId === n.menuId);
                return {
                  ...n,
                  checked: !!found,
                  children: n.children?.map(find),
                };
              };
              return find(top);
            });
            setAssignTree(next);
          }}
        />
      )}
    </Modal>
  );
}
