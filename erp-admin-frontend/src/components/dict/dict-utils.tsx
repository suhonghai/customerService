import { Modal } from 'antd';
import type { DictType } from '@/services/dict';

/**
 * 类型删除提示:后端当前没有 DELETE /api/dicts/types/:code 接口(Day 13 已知),
 * 类型删除需要直连 DB 操作或后端后续补 endpoint。
 *
 * 这里弹 Modal 提示用户联系管理员,而非发送会 404 的请求。
 */
export function confirmUnsupportedTypeDelete(r: DictType) {
  Modal.confirm({
    title: '暂不支持删除字典类型',
    content: (
      <div>
        <p>
          当前后端未开放 <code>DELETE /api/dicts/types/{r.code}</code> 接口,删除操作请联系管理员或
          DBA 直接处理。
        </p>
        <p style={{ color: '#999', fontSize: 12 }}>
          类型编码:<strong>{r.code}</strong>,关联字典项:<strong>{r.itemCount}</strong>
        </p>
      </div>
    ),
    okText: '知道了',
    cancelButtonProps: { style: { display: 'none' } },
  });
}
