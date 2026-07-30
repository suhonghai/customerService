import { useState } from 'react';
import { Modal, Form, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, createUser, updateUser, deleteUser } from '@/services/user';
import { UserFilters } from '@/components/user/UserFilters';
import { UserForm } from '@/components/user/UserForm';
import { UserTable } from '@/components/user/UserTable';
import { LoadingState, EmptyState, ErrorState } from '@/components/States';
import type { UserListItem, CreateUserDto, UpdateUserDto } from '@/services/user';

export default function UserPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<CreateUserDto>();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', page, pageSize, keyword],
    queryFn: () => listUsers({ page, pageSize, keyword: keyword || undefined }),
  });

  const createMut = useMutation({
    mutationFn: (dto: CreateUserDto) => createUser(dto),
    onSuccess: () => {
      message.success('创建成功');
      qc.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
    },
    onError: (e: Error) => message.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...dto }: { id: number } & UpdateUserDto) => updateUser(id, dto),
    onSuccess: () => {
      message.success('更新成功');
      qc.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
    },
    onError: (e: Error) => message.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      message.success('删除成功');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const onCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1 });
    setModalOpen(true);
  };
  const onEdit = (u: UserListItem) => {
    setEditing(u);
    form.setFieldsValue({
      username: u.username,
      nickname: u.nickname || undefined,
      email: u.email || undefined,
      phone: u.phone || undefined,
      status: u.status,
      roleIds: u.roles?.map((r) => r.id),
    });
    setModalOpen(true);
  };
  const onSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      const { roleIds: _r, username: _u, password: _p, ...rest } = values;
      updateMut.mutate({ id: editing.id, ...rest });
    } else {
      createMut.mutate(values);
    }
  };

  return (
    <div>
      {/* ── Section Header ───────────────────── */}
      <div
        className="reveal"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 24,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="section-tag" style={{ marginBottom: 8 }}>
            <span className="num">§ 02</span>
            <span>System / 用户管理</span>
          </div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Users
          </h2>
        </div>
        <UserFilters
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          onCreate={onCreate}
        />
      </div>

      {error ? (
        <ErrorState error={error as Error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingState />
      ) : (data?.list || []).length === 0 ? (
        <EmptyState description="暂无用户" />
      ) : (
        <UserTable
          data={data?.list || []}
          loading={isLoading}
          page={page}
          pageSize={pageSize}
          total={data?.total || 0}
          onPageChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
          onEdit={onEdit}
          onDelete={deleteMut.mutate}
        />
      )}

      <Modal
        title={editing ? '编辑用户' : '新增用户'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={onSubmit}
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={520}
        destroyOnHidden
      >
        <UserForm form={form} editing={editing} />
      </Modal>
    </div>
  );
}
