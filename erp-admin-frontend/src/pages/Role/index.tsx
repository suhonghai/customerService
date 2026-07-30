import { useState } from 'react';
import { Button, Form, Input, message, Space } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listRoles, createRole, updateRole, deleteRole } from '@/services/role';
import { PermissionButton } from '@/components/PermissionButton';
import { LoadingState, EmptyState, ErrorState } from '@/components/States';
import { RoleTable } from '@/components/role/RoleTable';
import { RoleFormModal } from '@/components/role/RoleFormModal';
import { AssignMenuModal } from '@/components/role/AssignMenuModal';
import type { RoleFormValues } from '@/components/role/RoleFormModal';
import { DEFAULT_ROLE_VALUES } from '@/components/role/role-constants';
import type { RoleListItem, CreateRoleDto, UpdateRoleDto } from '@/services/role';

export default function RolePage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<RoleListItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignRole, setAssignRole] = useState<RoleListItem | null>(null);
  const [form] = Form.useForm<RoleFormValues>();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['roles', page, pageSize, keyword],
    queryFn: () => listRoles({ page, pageSize, keyword: keyword || undefined }),
  });

  const createMut = useMutation({
    mutationFn: (dto: CreateRoleDto) => createRole(dto),
    onSuccess: () => {
      message.success('创建成功');
      qc.invalidateQueries({ queryKey: ['roles'] });
      setModalOpen(false);
    },
    onError: (e: Error) => message.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...dto }: { id: number } & UpdateRoleDto) => updateRole(id, dto),
    onSuccess: () => {
      message.success('更新成功');
      qc.invalidateQueries({ queryKey: ['roles'] });
      setModalOpen(false);
    },
    onError: (e: Error) => message.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      message.success('删除成功');
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const onCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue(DEFAULT_ROLE_VALUES);
    setModalOpen(true);
  };
  const onEdit = (r: RoleListItem) => {
    setEditing(r);
    form.setFieldsValue({
      code: r.code,
      name: r.name,
      description: r.description ?? undefined,
      dataScope: r.dataScope,
      sort: r.sort,
      status: r.status,
    });
    setModalOpen(true);
  };
  const onSubmit = async () => {
    const values = await form.validateFields();
    if (editing) updateMut.mutate({ id: editing.id, ...values });
    else createMut.mutate(values);
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索 code / 名称"
          allowClear
          enterButton
          style={{ width: 280 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <PermissionButton permCode="role:create">
          <Button type="primary" onClick={onCreate}>
            新增角色
          </Button>
        </PermissionButton>
      </Space>
      {error ? (
        <ErrorState error={error as Error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingState />
      ) : (data?.list || []).length === 0 ? (
        <EmptyState description="暂无角色" />
      ) : (
        <RoleTable
          data={data?.list || []}
          page={page}
          pageSize={pageSize}
          total={data?.total || 0}
          onPageChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
          onEdit={onEdit}
          onAssignMenu={setAssignRole}
          onDelete={(id) => deleteMut.mutate(id)}
        />
      )}

      <RoleFormModal
        open={modalOpen}
        editing={editing}
        form={form}
        loading={createMut.isPending || updateMut.isPending}
        onCancel={() => setModalOpen(false)}
        onSubmit={onSubmit}
      />

      <AssignMenuModal open={!!assignRole} role={assignRole} onClose={() => setAssignRole(null)} />
    </div>
  );
}
