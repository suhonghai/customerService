import { Outlet } from 'react-router-dom';

/** 仅承载登录页等无侧边栏路由 */
export function BlankLayout() {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Outlet />
    </div>
  );
}
