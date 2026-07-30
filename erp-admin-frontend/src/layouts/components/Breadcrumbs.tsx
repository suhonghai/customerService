import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Breadcrumb } from 'antd';
import { getBreadcrumb } from '@/router/route-map';

/**
 * 面包屑:从当前 route 自动生成。
 * route-map 未匹配时 fallback 到 '首页'。
 */
export function Breadcrumbs() {
  const location = useLocation();

  const items = useMemo(() => {
    const trail = getBreadcrumb(location.pathname);
    return trail.length > 0 ? trail : [{ title: '首页' }];
  }, [location.pathname]);

  return <Breadcrumb items={items.map((b) => ({ title: b.title }))} />;
}
