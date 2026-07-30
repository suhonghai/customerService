import { Button, Input, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { PermissionButton } from '@/components/PermissionButton';

export interface UserFiltersProps {
  onSearch: (keyword: string) => void;
  onCreate: () => void;
}

export function UserFilters({ onSearch, onCreate }: UserFiltersProps) {
  return (
    <Space>
      <Input.Search
        placeholder="搜索用户名 / 昵称 / 邮箱"
        allowClear
        enterButton
        style={{ width: 280 }}
        onSearch={(value) => onSearch(value)}
      />
      <PermissionButton permCode="user:create">
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          New User
        </Button>
      </PermissionButton>
    </Space>
  );
}
