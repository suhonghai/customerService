import { Spin, Empty, Alert, Button } from 'antd';

/**
 * 通用加载中态 — 居中 Spin,带 padding
 */
export function LoadingState({ tip }: { tip?: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 40,
        minHeight: 160,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spin>
        {tip ? <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>{tip}</div> : null}
      </Spin>
    </div>
  );
}

/**
 * 通用空数据态 — Antd Empty,带 padding
 */
export function EmptyState({ description = '暂无数据' }: { description?: string }) {
  return (
    <div style={{ padding: 40 }}>
      <Empty description={description} />
    </div>
  );
}

/**
 * 通用错误态 — Antd Alert,带可选重试按钮
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '未知错误';
  return (
    <div style={{ padding: 16 }}>
      <Alert
        type="error"
        message="加载失败"
        description={message}
        showIcon
        action={
          onRetry ? (
            <Button size="small" danger onClick={onRetry}>
              重试
            </Button>
          ) : null
        }
      />
    </div>
  );
}
