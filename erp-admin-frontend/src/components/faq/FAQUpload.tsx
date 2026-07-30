import { useEffect } from 'react';
import { Modal, Form, Input, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { FAQ_ALLOWED_EXTENSIONS } from '@/utils/faq-file';

const ACCEPT = FAQ_ALLOWED_EXTENSIONS.join(',');

export interface FAQUploadValues {
  title: string;
  category?: string;
  tags?: string;
}

export interface FAQUploadProps {
  open: boolean;
  loading: boolean;
  /** 父级持有的 file(controlled);Modal 打开时由父级清空 */
  file: File | null;
  onFileChange: (file: File | null) => void;
  onCancel: () => void;
  onSubmit: (vals: FAQUploadValues, file: File) => void;
}

/**
 * FAQ 上传弹窗 — 用户填标题 / 分类 / 标签 + 拖入文件(.md / .txt / .pdf)。
 *
 * 文件由父级 controlled(本组件通过 file / onFileChange 双向绑定),
 * `useEffect` 监听 open 切换时自动清空表单。
 */
export function FAQUpload({
  open,
  loading,
  file,
  onFileChange,
  onCancel,
  onSubmit,
}: FAQUploadProps) {
  const [form] = Form.useForm<FAQUploadValues>();

  // 每次重新打开时清空表单 + file
  useEffect(() => {
    if (open) {
      form.resetFields();
      onFileChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFinish = (vals: FAQUploadValues) => {
    if (!file) return;
    onSubmit(vals, file);
  };

  return (
    <Modal
      title="上传 FAQ"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText="上传"
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="FAQ 文档标题" />
        </Form.Item>
        <Form.Item name="category" label="分类">
          <Input placeholder="如 售后/物流/账户" />
        </Form.Item>
        <Form.Item name="tags" label="标签">
          <Input placeholder="逗号分隔,如 退款,发票" />
        </Form.Item>
        <Form.Item label="文件" required>
          <Upload.Dragger
            accept={ACCEPT}
            maxCount={1}
            beforeUpload={(f) => {
              onFileChange(f);
              return false; // 阻止自动上传
            }}
            onRemove={() => onFileChange(null)}
            fileList={
              file
                ? [
                    {
                      uid: '-1',
                      name: file.name,
                      status: 'done',
                    } as any,
                  ]
                : []
            }
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域</p>
            <p className="ant-upload-hint">支持 .md / .txt / .pdf,单文件</p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Modal>
  );
}
