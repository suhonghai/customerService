import { Drawer, Descriptions, Tag, Timeline } from 'antd';
import { FAQ_STATUS_META } from './FAQTable';
import type { FAQ } from '@/hooks/use-faqs';

export interface VersionDrawerProps {
  open: boolean;
  faq: FAQ | null;
  onClose: () => void;
}

/**
 * FAQ 详情侧滑 — 展示分类 / 标签 / 当前版本 / 状态 + 版本历史 Timeline。
 *
 * 不持有任何业务状态,纯展示。父级负责把 faq 完整数据传进来(可在打开后异步拉详情)。
 */
export function VersionDrawer({ open, faq, onClose }: VersionDrawerProps) {
  return (
    <Drawer title={faq?.title || ''} width={720} open={open} onClose={onClose} destroyOnClose>
      {faq && (
        <>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="分类">{faq.category || '-'}</Descriptions.Item>
            <Descriptions.Item label="标签">{faq.tags || '-'}</Descriptions.Item>
            <Descriptions.Item label="当前版本">v{faq.currentVersion}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={FAQ_STATUS_META[faq.status]?.color || 'default'}>
                {FAQ_STATUS_META[faq.status]?.label || '未知'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {faq.createdAt ? new Date(faq.createdAt).toLocaleString() : '-'}
            </Descriptions.Item>
          </Descriptions>

          <h3 style={{ marginTop: 24 }}>版本历史</h3>
          {faq.versions && faq.versions.length > 0 ? (
            <Timeline
              items={faq.versions.map((v) => ({
                children: (
                  <div>
                    <strong>v{v.version}</strong> — {v.creatorName || '-'}
                    <div style={{ color: '#888', fontSize: 12 }}>
                      {v.createdAt ? new Date(v.createdAt).toLocaleString() : ''}
                    </div>
                    {v.changelog && <div>{v.changelog}</div>}
                  </div>
                ),
              }))}
            />
          ) : (
            <div style={{ color: '#888' }}>暂无版本历史</div>
          )}
        </>
      )}
    </Drawer>
  );
}
