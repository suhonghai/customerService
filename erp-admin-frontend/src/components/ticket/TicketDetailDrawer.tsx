import { Drawer, Tabs, Descriptions, Timeline } from 'antd';
import ConversationPanel from '@/components/ConversationPanel';
import TicketStatusTag from './TicketStatusTag';
import TicketPriorityTag from './TicketPriorityTag';
import type { TicketListItem } from './TicketTable';

interface Props {
  open: boolean;
  ticket:
    (TicketListItem & { description?: string; logs?: any[]; sessionId?: string | null }) | null;
  onClose: () => void;
}

/**
 * 工单详情抽屉 — Tabs:
 *   1. 对话流:ConversationPanel(实时消息 + 客服回复)
 *   2. 详情:Descriptions + 处理日志 Timeline
 *
 * 行为:
 *   - ticket=null 时不渲染 Tabs 内容,避免空指针
 *   - 抽屉标题展示工单号
 */
export default function TicketDetailDrawer({ open, ticket, onClose }: Props) {
  return (
    <Drawer title={`工单 ${ticket?.ticketNo || ''}`} width={720} open={open} onClose={onClose}>
      {ticket && (
        <Tabs
          defaultActiveKey="chat"
          items={[
            {
              key: 'chat',
              label: '对话流',
              children: (
                <ConversationPanel
                  ticketId={ticket.id}
                  sessionId={ticket.sessionId ?? null}
                  ticketNo={ticket.ticketNo}
                />
              ),
            },
            {
              key: 'detail',
              label: '详情',
              children: (
                <>
                  <Descriptions column={2} bordered size="small">
                    <Descriptions.Item label="标题" span={2}>
                      {ticket.title}
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <TicketStatusTag status={ticket.status} />
                    </Descriptions.Item>
                    <Descriptions.Item label="优先级">
                      <TicketPriorityTag priority={ticket.priority} />
                    </Descriptions.Item>
                    <Descriptions.Item label="处理人">
                      {ticket.assigneeName || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="创建人">
                      {ticket.creatorName || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="SLA 截止" span={2}>
                      {ticket.slaDeadline ? new Date(ticket.slaDeadline).toLocaleString() : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="描述" span={2}>
                      {ticket.description || '-'}
                    </Descriptions.Item>
                  </Descriptions>

                  <h3 style={{ marginTop: 24 }}>处理日志</h3>
                  {ticket.logs && ticket.logs.length > 0 ? (
                    <Timeline
                      items={ticket.logs.map((log: any) => ({
                        children: (
                          <div>
                            <div>{log.content || log.action}</div>
                            <div style={{ color: '#888', fontSize: 12 }}>
                              {log.operatorName || '-'} —{' '}
                              {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                            </div>
                          </div>
                        ),
                      }))}
                    />
                  ) : (
                    <div style={{ color: '#888' }}>暂无日志</div>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
}
