import { Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import type { MenuListItem } from '@/services/menu';
import type { MenuNode } from '@/stores/menu';
import { DEFAULT_MENU_VALUES, STATUS_OPTIONS, TYPE_OPTIONS } from './menu-constants';
import { buildParentOptions } from './menu-utils';

/**
 * MenuForm 表单字段类型,覆盖 CreateMenuDto / UpdateMenuDto 公共子集。
 */
export interface MenuFormValues {
  parentId?: number | null;
  name: string;
  type: 1 | 2 | 3;
  path?: string;
  component?: string;
  icon?: string;
  permCode?: string;
  sort?: number;
  visible?: boolean;
  status?: number;
}

export interface MenuFormModalProps {
  open: boolean;
  editing: MenuListItem | null;
  form: FormInstance<MenuFormValues>;
  /** 父级 Select 用的菜单树 query(isLoading + data) */
  treeQ: { isLoading: boolean; data: MenuNode[] | undefined };
  loading: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

/**
 * 菜单新增/编辑 Modal —— Modal + Form 字段组合。
 *
 * - 根据 type 切换字段:
 *   - type 1/2 (目录/菜单):显示 path / component / icon
 *   - type 3   (按钮):显示 permCode(必填 + 校验)
 * - 父级选项通过 buildParentOptions(tree) 生成,顶层 = null
 * - 提交按钮 loading + onSubmit 由父级 controlled
 */
export function MenuFormModal({
  open,
  editing,
  form,
  treeQ,
  loading,
  onCancel,
  onSubmit,
}: MenuFormModalProps) {
  const typeWatch = Form.useWatch('type', form);
  const parentOptions = buildParentOptions(treeQ.data);

  return (
    <Modal
      title={editing ? '编辑菜单/按钮' : '新增菜单/按钮'}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={loading}
      width={560}
      destroyOnHidden
    >
      <Form<MenuFormValues>
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={editing ? undefined : DEFAULT_MENU_VALUES}
      >
        <Form.Item name="parentId" label="父级">
          <Select options={parentOptions} placeholder="顶层" />
        </Form.Item>
        <Form.Item name="type" label="类型" rules={[{ required: true }]}>
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true, max: 50 }]}>
          <Input />
        </Form.Item>
        {typeWatch !== 3 && (
          <>
            <Form.Item name="path" label="路由路径">
              <Input placeholder="如 /system/user" />
            </Form.Item>
            <Form.Item name="component" label="前端组件路径">
              <Input placeholder="如 system/User/index" />
            </Form.Item>
            <Form.Item name="icon" label="图标">
              <Input placeholder="如 UserOutlined" />
            </Form.Item>
          </>
        )}
        {typeWatch === 3 && (
          <Form.Item
            name="permCode"
            label="权限码"
            rules={[{ required: true, max: 100, pattern: /^[a-zA-Z0-9_:-]+$/ }]}
          >
            <Input placeholder="如 user:create" />
          </Form.Item>
        )}
        {typeWatch !== 3 && (
          <Form.Item name="permCode" label="权限码(可选)">
            <Input placeholder="如 user:view" />
          </Form.Item>
        )}
        <Form.Item name="sort" label="排序" initialValue={0}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="visible" label="可见" valuePropName="checked" initialValue={true}>
          <Switch />
        </Form.Item>
        <Form.Item name="status" label="状态" initialValue={1}>
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
