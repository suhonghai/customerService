import { Routes, Route } from 'react-router-dom';
import { BasicLayout } from '@/layouts/BasicLayout';
import { BlankLayout } from '@/layouts/BlankLayout';
import { ProtectedRoute } from './ProtectedRoute';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import UserPage from '@/pages/User';
import RolePage from '@/pages/Role';
import MenuPage from '@/pages/Menu';
import SessionPage from '@/pages/Session';
import StatsPage from '@/pages/Stats';
import AuditLogPage from '@/pages/AuditLog';
import DictPage from '@/pages/Dict';
import ProfilePage from '@/pages/Profile';
import AIConfigPage from '@/pages/AIConfig';
import PromptTemplatePage from '@/pages/AIConfig/Prompt';
import FAQPage from '@/pages/FAQ';
import OrderPage from '@/pages/Order';
import TicketPage from '@/pages/Ticket';
import NotFound from '@/pages/NotFound';
import NoPermission from '@/pages/NoPermission';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<BlankLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <BasicLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/system/user"
          element={
            <ProtectedRoute requiredPerm="user:view">
              <UserPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/system/role"
          element={
            <ProtectedRoute requiredPerm="role:view">
              <RolePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/system/menu"
          element={
            <ProtectedRoute requiredPerm="menu:view">
              <MenuPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/system/dict"
          element={
            <ProtectedRoute requiredPerm="dict:view">
              <DictPage />
            </ProtectedRoute>
          }
        />
        {/* 会话管理(seed 路径:/sessions)*/}
        <Route
          path="/sessions"
          element={
            <ProtectedRoute requiredPerm="session:view">
              <SessionPage />
            </ProtectedRoute>
          }
        />
        {/* 数据看板(seed 路径:/stats)*/}
        <Route
          path="/stats"
          element={
            <ProtectedRoute requiredPerm="stats:view">
              <StatsPage />
            </ProtectedRoute>
          }
        />
        {/* 客服绩效(seed 路径:/stats/agent-performance)— StatsPage 内有 Tab 处理*/}
        <Route
          path="/stats/agent-performance"
          element={
            <ProtectedRoute requiredPerm="stats:view">
              <StatsPage />
            </ProtectedRoute>
          }
        />
        {/* 审计日志(seed 路径:/audit-logs)*/}
        <Route
          path="/audit-logs"
          element={
            <ProtectedRoute requiredPerm="audit-log:view">
              <AuditLogPage />
            </ProtectedRoute>
          }
        />
        {/* AI 配置(seed 路径:/ai-config)*/}
        <Route
          path="/ai-config"
          element={
            <ProtectedRoute requiredPerm="ai-config:view">
              <AIConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-config/prompt"
          element={
            <ProtectedRoute requiredPerm="ai-config:view">
              <PromptTemplatePage />
            </ProtectedRoute>
          }
        />
        {/* FAQ 管理(seed 路径:/faq)*/}
        <Route
          path="/faq"
          element={
            <ProtectedRoute requiredPerm="faq:view">
              <FAQPage />
            </ProtectedRoute>
          }
        />
        {/* 订单管理(seed 路径:/orders)*/}
        <Route
          path="/orders"
          element={
            <ProtectedRoute requiredPerm="order:view">
              <OrderPage />
            </ProtectedRoute>
          }
        />
        {/* 工单管理(seed 路径:/tickets)*/}
        <Route
          path="/tickets"
          element={
            <ProtectedRoute requiredPerm="ticket:view">
              <TicketPage />
            </ProtectedRoute>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route path="/403" element={<NoPermission />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
