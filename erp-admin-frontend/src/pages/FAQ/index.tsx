import { useState } from 'react';
import { Button, Space, Input, Select } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { FAQTable } from '@/components/faq/FAQTable';
import { FAQUpload, type FAQUploadValues } from '@/components/faq/FAQUpload';
import { VersionDrawer } from '@/components/faq/VersionDrawer';
import { PermissionButton } from '@/components/PermissionButton';
import {
  useFAQList,
  useFAQDetail,
  useUploadFAQ,
  useReviewFAQ,
  useDeleteFAQ,
  type FAQ,
} from '@/hooks/use-faqs';

/**
 * `/faq` — FAQ 文档列表 + 上传 + 详情 + 发布 / 下线。
 *
 * 业务逻辑(state 协调 / 拉列表 / 上传 / 详情 / 发布)留在 page 层,
 * 纯展示 Table / Upload / Drawer 拆分到 components/faq/*。
 */
export default function FAQPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState<FAQ | null>(null);

  const listQ = useFAQList({ page, pageSize, status: filterStatus, keyword });
  const detailQ = useFAQDetail(detailOpen ? (current?.id ?? null) : null);
  const uploadMut = useUploadFAQ({
    onSuccess: () => {
      setUploadOpen(false);
      setUploadFile(null);
    },
  });
  const reviewMut = useReviewFAQ();
  const deleteMut = useDeleteFAQ();

  // 当前详情:优先用 detailQ.data(完整 versions),否则用列表行快照
  const displayed = (detailQ.data || current) as FAQ | null;

  const openDetail = (r: FAQ) => {
    setCurrent(r);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setCurrent(null);
  };

  const handleUpload = (vals: FAQUploadValues, file: File) => {
    uploadMut.mutate({
      title: vals.title,
      category: vals.category,
      tags: vals.tags,
      file,
    });
  };

  return (
    <div style={{ padding: 'var(--content-padding)' }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <PermissionButton permCode="faq:create">
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
            上传 FAQ
          </Button>
        </PermissionButton>
        <Input.Search
          placeholder="搜索标题"
          allowClear
          style={{ width: 240 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Select
          placeholder="状态筛选"
          allowClear
          style={{ width: 160 }}
          onChange={(v) => {
            setFilterStatus(v);
            setPage(1);
          }}
          options={[
            { value: 0, label: '草稿' },
            { value: 1, label: '待审核' },
            { value: 2, label: '已发布' },
            { value: 3, label: '已下线' },
          ]}
        />
      </Space>

      <FAQTable
        data={(listQ.data?.list || []) as FAQ[]}
        loading={listQ.isLoading}
        page={page}
        pageSize={pageSize}
        total={listQ.data?.total || 0}
        onPageChange={setPage}
        onDetail={openDetail}
        onPublish={(r) => reviewMut.mutate({ id: r.id, action: 'publish' })}
        onOffline={(r) => reviewMut.mutate({ id: r.id, action: 'offline' })}
        onDelete={(r) => deleteMut.mutate(r.id)}
      />

      <FAQUpload
        open={uploadOpen}
        loading={uploadMut.isPending}
        file={uploadFile}
        onFileChange={setUploadFile}
        onCancel={() => {
          setUploadOpen(false);
          setUploadFile(null);
        }}
        onSubmit={handleUpload}
      />

      <VersionDrawer open={detailOpen} faq={displayed} onClose={closeDetail} />
    </div>
  );
}
