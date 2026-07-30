import { Drawer, Spin, Descriptions, Typography, Tabs, Tag } from 'antd';
import type { AuditLogDetail } from '@/services/audit-log';
import { fmtDate, fmtJson, statusColor, statusLabel } from './audit-log-utils';

const { Paragraph } = Typography;

export interface AuditLogDetailDrawerProps {
  open: boolean;
  /** 当前查看的日志 ID(用于标题展示) */
  drawerId: number | null;
  /** 已 fetch 完成的详情,loading 时为 undefined */
  log: AuditLogDetail | undefined;
  loading: boolean;
  onClose: () => void;
}

/**
 * 审计详情抽屉 — Tabs:
 *   1. 基本信息:12 字段 Descriptions + 状态 Tag + errorMsg
 *   2. 请求信息:HTTP 方法 / 路径 / IP / UA / 耗时 + 请求参数 JSON
 *   3. 变更对比:旧值 / 新值 双 JSON 块
 *
 * 数据全部由父容器 fetch 完通过 props 传进来,这里只渲染。
 * loading 时显示 Spin,log 为空时啥都不渲染(避免空指针)。
 */
export function AuditLogDetailDrawer({
  open,
  drawerId,
  log,
  loading,
  onClose,
}: AuditLogDetailDrawerProps) {
  return (
    <Drawer
      title={drawerId ? `审计详情 #${drawerId}` : '审计详情'}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnHidden
    >
      {loading ? (
        <Spin />
      ) : log ? (
        <Tabs
          defaultActiveKey="basic"
          items={[
            {
              key: 'basic',
              label: '基本信息',
              children: (
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label="ID">{log.id}</Descriptions.Item>
                  <Descriptions.Item label="时间">{fmtDate(log.createdAt)}</Descriptions.Item>
                  <Descriptions.Item label="用户">{log.username || '-'}</Descriptions.Item>
                  <Descriptions.Item label="用户 ID">{log.userId ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="模块">{log.module}</Descriptions.Item>
                  <Descriptions.Item label="动作">{log.action}</Descriptions.Item>
                  <Descriptions.Item label="资源">{log.resource || '-'}</Descriptions.Item>
                  <Descriptions.Item label="资源 ID">{log.resourceId || '-'}</Descriptions.Item>
                  <Descriptions.Item label="方法">{log.method || '-'}</Descriptions.Item>
                  <Descriptions.Item label="耗时">
                    {log.costMs != null ? `${log.costMs}ms` : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="IP">{log.ip || '-'}</Descriptions.Item>
                  <Descriptions.Item label="状态" span={2}>
                    <Tag color={statusColor(log.status)}>{statusLabel(log.status)}</Tag>
                    {log.errorMsg && (
                      <Paragraph type="danger" style={{ marginTop: 8, marginBottom: 0 }}>
                        {log.errorMsg}
                      </Paragraph>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="路径" span={2}>
                    {log.path || '-'}
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'request',
              label: '请求信息',
              children: (
                <div>
                  <Descriptions column={1} bordered size="small">
                    <Descriptions.Item label="HTTP 方法">
                      {log.method ? <Tag>{log.method}</Tag> : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="路径">{log.path || '-'}</Descriptions.Item>
                    <Descriptions.Item label="IP">{log.ip || '-'}</Descriptions.Item>
                    <Descriptions.Item label="User-Agent">
                      <div
                        style={{
                          wordBreak: 'break-all',
                          fontSize: 12,
                          color: '#666',
                        }}
                      >
                        {log.userAgent || '-'}
                      </div>
                    </Descriptions.Item>
                    <Descriptions.Item label="耗时">
                      {log.costMs != null ? `${log.costMs}ms` : '-'}
                    </Descriptions.Item>
                  </Descriptions>
                  <h4 style={{ marginTop: 16 }}>请求参数</h4>
                  <pre
                    style={{
                      background: '#f5f5f5',
                      padding: 12,
                      borderRadius: 4,
                      maxHeight: 320,
                      overflow: 'auto',
                      fontSize: 12,
                    }}
                  >
                    {fmtJson(log.params)}
                  </pre>
                </div>
              ),
            },
            {
              key: 'diff',
              label: '变更对比',
              children: (
                <div>
                  <h4 style={{ marginTop: 0 }}>旧值</h4>
                  <pre
                    style={{
                      background: '#fff1f0',
                      padding: 12,
                      borderRadius: 4,
                      maxHeight: 320,
                      overflow: 'auto',
                      fontSize: 12,
                      border: '1px solid #ffccc7',
                    }}
                  >
                    {fmtJson(log.oldValue)}
                  </pre>
                  <h4>新值</h4>
                  <pre
                    style={{
                      background: '#f6ffed',
                      padding: 12,
                      borderRadius: 4,
                      maxHeight: 320,
                      overflow: 'auto',
                      fontSize: 12,
                      border: '1px solid #b7eb8f',
                    }}
                  >
                    {fmtJson(log.newValue)}
                  </pre>
                </div>
              ),
            },
          ]}
        />
      ) : null}
    </Drawer>
  );
}
