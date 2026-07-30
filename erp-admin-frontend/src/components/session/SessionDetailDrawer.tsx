import { Drawer, Spin, Descriptions, List, Tag, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { sessionApi, type SessionMessage } from '@/services/session';
import { RatingTag, fmtDate } from './session-utils';

interface Props {
  open: boolean;
  sessionId: number | string | null;
  onClose: () => void;
}

/**
 * 会话详情抽屉 — Descriptions 基本信息(10 字段)+ 消息 List
 *
 * 数据由子组件自己 useQuery 拉(详情 + 消息列表),父容器只传 sessionId。
 * - loading:显示 Spin
 * - 数据为空:不渲染 Descriptions / 列表(避免空指针)
 * - 消息列表带 role Tag + 时间
 */
export function SessionDetailDrawer({ open, sessionId, onClose }: Props) {
  const detailQ = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionApi.getById(sessionId as number),
    enabled: sessionId != null,
  });

  const messagesQ = useQuery({
    queryKey: ['session', sessionId, 'messages'],
    queryFn: () => sessionApi.getMessages(sessionId as number, { pageSize: 200, sortOrder: 'asc' }),
    enabled: sessionId != null,
  });

  return (
    <Drawer
      title={sessionId ? `会话详情 #${sessionId}` : '会话详情'}
      open={open}
      onClose={onClose}
      width={680}
      destroyOnHidden
    >
      {detailQ.isLoading ? (
        <Spin />
      ) : detailQ.data ? (
        <>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="会话 ID">{detailQ.data.id}</Descriptions.Item>
            <Descriptions.Item label="会话 Key">{detailQ.data.sessionKey}</Descriptions.Item>
            <Descriptions.Item label="访客">
              {detailQ.data.visitorName || detailQ.data.visitorId}
            </Descriptions.Item>
            <Descriptions.Item label="渠道">{detailQ.data.channelLabel}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={detailQ.data.status === 1 ? 'processing' : 'default'}>
                {detailQ.data.statusLabel}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="AI 模型">{detailQ.data.aiModelCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="消息数">{detailQ.data.messageCount}</Descriptions.Item>
            <Descriptions.Item label="评分">
              <RatingTag value={detailQ.data.rating} />
            </Descriptions.Item>
            <Descriptions.Item label="开始时间">
              {fmtDate(detailQ.data.startedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="结束时间">{fmtDate(detailQ.data.endedAt)}</Descriptions.Item>
          </Descriptions>
          <h4 style={{ marginTop: 16 }}>消息列表</h4>
          {messagesQ.isLoading ? (
            <Spin />
          ) : (
            <List
              dataSource={messagesQ.data?.list || []}
              locale={{ emptyText: '暂无消息' }}
              renderItem={(m: SessionMessage) => (
                <List.Item>
                  <Space align="start" style={{ width: '100%' }}>
                    <Tag
                      color={
                        m.role === 'user' ? 'blue' : m.role === 'assistant' ? 'green' : 'default'
                      }
                    >
                      {m.role}
                    </Tag>
                    <div style={{ flex: 1 }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                      <div style={{ color: '#999', fontSize: 12 }}>
                        {new Date(m.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </>
      ) : null}
    </Drawer>
  );
}
