import { useState, useEffect } from 'react';
import { Button, Card, message } from 'antd';
import { type DictType, type DictItem } from '@/services/dict';
import { PermissionButton } from '@/components/PermissionButton';
import { DictTypeTable } from '@/components/dict/DictTypeTable';
import { DictItemTable } from '@/components/dict/DictItemTable';
import { DictTypeFormModal } from '@/components/dict/DictTypeFormModal';
import { DictItemFormModal } from '@/components/dict/DictItemFormModal';
import { confirmUnsupportedTypeDelete } from '@/components/dict/dict-utils';
import { useDictTypes, useDictItems, useDictMutations } from '@/components/dict/dict-hooks';

export default function DictPage() {
  const [selectedType, setSelectedType] = useState<DictType | null>(null);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DictItem | null>(null);
  const typesQ = useDictTypes();
  const itemsQ = useDictItems(selectedType?.code);
  const { createType, createItem, updateItem, removeItem } = useDictMutations(selectedType);

  // 默认选中第一个类型
  useEffect(() => {
    if (!selectedType && typesQ.data && typesQ.data.length > 0) {
      setSelectedType(typesQ.data[0]);
    }
  }, [typesQ.data, selectedType]);

  const onCreateItem = () => {
    if (!selectedType) return message.warning('请先选择左侧字典类型');
    setEditingItem(null);
    setItemModalOpen(true);
  };

  return (
    <div>
      <Card
        title="字典类型"
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <PermissionButton permCode="dict:create">
            <Button type="primary" size="small" onClick={() => setTypeModalOpen(true)}>
              新增类型
            </Button>
          </PermissionButton>
        }
      >
        <DictTypeTable
          data={typesQ.data || []}
          loading={typesQ.isLoading}
          selectedId={selectedType?.id}
          onSelect={setSelectedType}
          onDelete={confirmUnsupportedTypeDelete}
        />
      </Card>

      <Card
        size="small"
        title={selectedType ? `字典项 - ${selectedType.name} (${selectedType.code})` : '字典项'}
        extra={
          <PermissionButton permCode="dict:create">
            <Button type="primary" size="small" onClick={onCreateItem}>
              新增项
            </Button>
          </PermissionButton>
        }
      >
        <DictItemTable
          data={itemsQ.data || []}
          loading={itemsQ.isLoading}
          onEdit={(i) => {
            setEditingItem(i);
            setItemModalOpen(true);
          }}
          onDelete={(id) => removeItem.mutate(id)}
          selectedTypeName={selectedType?.name ?? null}
        />
      </Card>

      <DictTypeFormModal
        open={typeModalOpen}
        loading={createType.isPending}
        onCancel={() => setTypeModalOpen(false)}
        onSubmit={(v) => {
          createType.mutate(v, { onSuccess: () => setTypeModalOpen(false) });
        }}
      />
      <DictItemFormModal
        open={itemModalOpen}
        editing={editingItem}
        loading={createItem.isPending || updateItem.isPending}
        onCancel={() => setItemModalOpen(false)}
        onSubmit={(v) => {
          const close = () => setItemModalOpen(false);
          if (editingItem) updateItem.mutate({ id: editingItem.id, ...v }, { onSuccess: close });
          else createItem.mutate(v, { onSuccess: close });
        }}
      />
    </div>
  );
}
