import { Modal, Form, Input, Select, message } from 'antd';
import { TICKET_STATUS } from './ticket-constants';
import {
  useAssignableUsersQuery,
  useAssignTicket,
  useUpdateTicketStatus,
  useReplyTicket,
} from '@/hooks/use-tickets';
import type { TicketRow } from './TicketActions';

interface Props {
  assigning: TicketRow | null;
  assignOpen: boolean;
  onAssignClose: () => void;

  statusEditing: TicketRow | null;
  statusModalOpen: boolean;
  onStatusModalClose: () => void;

  replying: TicketRow | null;
  replyOpen: boolean;
  onReplyClose: () => void;
}

/**
 * 工单三个操作弹窗:
 *   - AssignModal:选择客服,POST /tickets/:id/assign
 *   - StatusModal:选择新状态,PUT /tickets/:id/status
 *   - ReplyModal :回复内容,POST /tickets/:id/reply
 *
 * 设计:三个弹窗放在一个组件里,共享父级 props 命名空间,
 *      各自持有独立 [form] 实例(避免互相污染)。
 */
export default function TicketModals({
  assigning,
  assignOpen,
  onAssignClose,
  statusEditing,
  statusModalOpen,
  onStatusModalClose,
  replying,
  replyOpen,
  onReplyClose,
}: Props) {
  const [assignForm] = Form.useForm();
  const [statusForm] = Form.useForm();
  const [replyForm] = Form.useForm();

  const usersQ = useAssignableUsersQuery(assignOpen);
  const assignMut = useAssignTicket();
  const statusMut = useUpdateTicketStatus();
  const replyMut = useReplyTicket();

  const onAssignFinish = async (v: any) => {
    try {
      await assignMut.mutateAsync({ id: assigning!.id, ...v });
      message.success('已分配');
      onAssignClose();
    } catch (e: any) {
      message.error(e?.message || '分配失败');
    }
  };

  const onStatusFinish = async (v: any) => {
    try {
      await statusMut.mutateAsync({ id: statusEditing!.id, ...v });
      message.success('状态已更新');
      onStatusModalClose();
    } catch (e: any) {
      message.error(e?.message || '状态更新失败');
    }
  };

  const onReplyFinish = async (v: any) => {
    try {
      await replyMut.mutateAsync({ id: replying!.id, ...v });
      message.success('回复成功');
      onReplyClose();
    } catch (e: any) {
      message.error(e?.message || '回复失败');
    }
  };

  return (
    <>
      <Modal
        title={`分配 ${assigning?.ticketNo || ''}`}
        open={assignOpen}
        onCancel={onAssignClose}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMut.isPending}
      >
        <Form form={assignForm} layout="vertical" onFinish={onAssignFinish}>
          <Form.Item name="assigneeId" label="处理人" rules={[{ required: true }]}>
            <Select
              showSearch
              loading={usersQ.isLoading}
              placeholder="选择客服"
              optionFilterProp="label"
              options={(usersQ.data?.list || []).map((u: any) => ({
                value: u.id,
                label: `${u.nickname || u.username} (${u.username})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`改状态 ${statusEditing?.ticketNo || ''}`}
        open={statusModalOpen}
        onCancel={onStatusModalClose}
        onOk={() => statusForm.submit()}
        confirmLoading={statusMut.isPending}
      >
        <Form form={statusForm} layout="vertical" onFinish={onStatusFinish}>
          <Form.Item name="status" label="新状态" rules={[{ required: true }]}>
            <Select
              options={Object.entries(TICKET_STATUS).map(([k, v]) => ({
                value: Number(k),
                label: v.t,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`回复 ${replying?.ticketNo || ''}`}
        open={replyOpen}
        onCancel={onReplyClose}
        onOk={() => replyForm.submit()}
        confirmLoading={replyMut.isPending}
      >
        <Form form={replyForm} layout="vertical" onFinish={onReplyFinish}>
          <Form.Item name="content" label="回复内容" rules={[{ required: true }]}>
            <Input.TextArea rows={5} placeholder="对客户的回复内容" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
