import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function NoPermissionPage() {
  const navigate = useNavigate();
  return (
    <Result
      status="403"
      title="403"
      subTitle="抱歉,你没有访问该页面的权限"
      extra={
        <Button type="primary" onClick={() => navigate('/', { replace: true })}>
          回到首页
        </Button>
      }
    />
  );
}
