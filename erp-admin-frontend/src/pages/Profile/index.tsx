import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Spin, Form, message } from 'antd';
import { useQuery, useMutation } from '@tanstack/react-query';
import { profileApi, type MeResponse } from '@/services/profile';
import { useAuthStore } from '@/stores/auth';
import { ProfileInfo } from '@/components/profile/ProfileInfo';
import {
  ChangePasswordForm,
  type ChangePasswordValues,
} from '@/components/profile/ChangePasswordForm';

export default function ProfilePage() {
  const [form] = Form.useForm<ChangePasswordValues>();
  const navigate = useNavigate();
  const setUserInfo = useAuthStore((s) => s.setUserInfo);
  const userInfo = useAuthStore((s) => s.userInfo);
  const logout = useAuthStore((s) => s.logout);

  const meQ = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => profileApi.getMe(),
  });

  // 同步 /auth/me → store,刷新页面时 header 显示最新
  useEffect(() => {
    if (meQ.data) {
      setUserInfo({
        id: meQ.data.id,
        username: meQ.data.username,
        nickname: meQ.data.nickname || undefined,
        avatar: meQ.data.avatar,
        roles: meQ.data.roles,
        permissions: meQ.data.permissions,
      });
    }
  }, [meQ.data, setUserInfo]);

  const pwdMut = useMutation({
    mutationFn: (dto: { oldPassword: string; newPassword: string }) =>
      profileApi.changePassword(dto),
    onSuccess: () => {
      message.success('密码修改成功,请重新登录');
      form.resetFields();
      // 改密码后立即清登录态并跳 /login(后端会撤销 refresh token,旧 access 也会失效)
      setTimeout(() => {
        logout();
        navigate('/login', { replace: true });
      }, 600);
    },
    onError: (e: Error) => message.error(e.message),
  });

  // 兜底:meQ 还没返回时,优先用 store 里的 userInfo(保持 header / Descriptions 同步)
  const me = meQ.data || (userInfo as unknown as MeResponse | null);

  return (
    <Spin spinning={meQ.isLoading}>
      <Card title="个人信息" style={{ marginBottom: 16 }}>
        <ProfileInfo me={me} />
      </Card>

      <Card title="修改密码">
        <ChangePasswordForm
          form={form}
          loading={pwdMut.isPending}
          onSubmit={(vals) => pwdMut.mutate(vals)}
        />
      </Card>
    </Spin>
  );
}
