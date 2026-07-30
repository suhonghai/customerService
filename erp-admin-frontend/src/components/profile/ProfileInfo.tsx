import { Descriptions, Tag, Space } from 'antd';
import type { MeResponse } from '@/services/profile';

/**
 * 把日期字符串格式化成本地时间;空值兜底为 '-'。
 * 单独抽出来便于测试,以及未来多语言扩展。
 */
function fmt(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleString() : '-';
}

export interface ProfileInfoProps {
  /** 后端 /auth/me 返回的完整用户信息(可空:首屏时 loading) */
  me: MeResponse | null;
}

/**
 * 个人信息展示卡 — Descriptions 渲染用户名 / 昵称 / 邮箱 / 手机号 / 角色 / 登录信息。
 *
 * 纯展示组件,所有字段通过 `me` props 传入。无业务状态、无副作用。
 * 角色为空时显示「无」tag,字符串字段为空时兜底 '-'。
 */
export function ProfileInfo({ me }: ProfileInfoProps) {
  if (!me) return null;

  const roles = me.roles || [];

  return (
    <Descriptions column={2} bordered size="small">
      <Descriptions.Item label="用户名">{me.username}</Descriptions.Item>
      <Descriptions.Item label="昵称">{me.nickname || '-'}</Descriptions.Item>
      <Descriptions.Item label="邮箱">{me.email || '-'}</Descriptions.Item>
      <Descriptions.Item label="手机号">{me.phone || '-'}</Descriptions.Item>
      <Descriptions.Item label="角色" span={2}>
        {roles.length > 0 ? (
          <Space size={4} wrap>
            {roles.map((r) => (
              <Tag key={r.id} color="blue">
                {r.name}
              </Tag>
            ))}
          </Space>
        ) : (
          <Tag>无</Tag>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="最后登录时间">{fmt(me.lastLoginAt)}</Descriptions.Item>
      <Descriptions.Item label="最后登录 IP">{me.lastLoginIp || '-'}</Descriptions.Item>
      <Descriptions.Item label="创建时间" span={2}>
        {fmt(me.createdAt)}
      </Descriptions.Item>
    </Descriptions>
  );
}
