import { useState } from 'react';
import { Button, Form, message, Space } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listMenus, createMenu, updateMenu, deleteMenu, fetchMenuTree } from '@/services/menu';
import { PermissionButton } from '@/components/PermissionButton';
import { LoadingState, EmptyState, ErrorState } from '@/components/States';
import { MenuTable } from '@/components/menu/MenuTable';
import { MenuFormModal } from '@/components/menu/MenuFormModal';
import type { MenuFormValues } from '@/components/menu/MenuFormModal';
import { DEFAULT_MENU_VALUES } from '@/components/menu/menu-constants';
import type { MenuListItem, CreateMenuDto, UpdateMenuDto } from '@/services/menu';

export default function MenuPage() {
  const [editing, setEditing] = useState<MenuListItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<MenuFormValues>();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['menus', 'list'],
    queryFn: () => listMenus({ page: 1, pageSize: 1000 }),
  });

  const treeQ = useQuery({
    queryKey: ['menus', 'tree'],
    queryFn: () => fetchMenuTree(),
  });

  const createMut = useMutation({
    mutationFn: (dto: CreateMenuDto) => createMenu(dto),
    onSuccess: () => {
      message.success('创建成功');
      qc.invalidateQueries({ queryKey: ['menus'] });
      setModalOpen(false);
    },
    onError: (e: Error) => message.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...dto }: { id: number } & UpdateMenuDto) => updateMenu(id, dto),
    onSuccess: () => {
      message.success('更新成功');
      qc.invalidateQueries({ queryKey: ['menus'] });
      setModalOpen(false);
    },
    onError: (e: Error) => message.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteMenu(id),
    onSuccess: () => {
      message.success('删除成功');
      qc.invalidateQueries({ queryKey: ['menus'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const onCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue(DEFAULT_MENU_VALUES);
    setModalOpen(true);
  };
  const onEdit = (m: MenuListItem) => {
    setEditing(m);
    form.setFieldsValue({
      parentId: m.parentId ?? null,
      name: m.name,
      path: m.path ?? '',
      component: m.component ?? '',
      icon: m.icon ?? '',
      type: m.type,
      permCode: m.permCode ?? '',
      sort: m.sort,
      visible: m.visible,
      status: m.status,
    });
    setModalOpen(true);
  };
  const onSubmit = async () => {
    const values: MenuFormValues = await form.validateFields();
    const payload = {
      ...values,
      parentId: values.parentId ?? null,
      visible: values.visible ?? true,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <PermissionButton permCode="menu:create">
          <Button type="primary" onClick={onCreate}>
            新增菜单/按钮
          </Button>
        </PermissionButton>
      </Space>
      {error ? (
        <ErrorState error={error as Error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingState />
      ) : (data || []).length === 0 ? (
        <EmptyState description="暂无菜单" />
      ) : (
        <MenuTable
          data={data || []}
          loading={isLoading}
          onEdit={onEdit}
          onDelete={(id) => deleteMut.mutate(id)}
        />
      )}

      <MenuFormModal
        open={modalOpen}
        editing={editing}
        form={form}
        treeQ={treeQ}
        loading={createMut.isPending || updateMut.isPending}
        onCancel={() => setModalOpen(false)}
        onSubmit={onSubmit}
      />
    </div>
  );
}
