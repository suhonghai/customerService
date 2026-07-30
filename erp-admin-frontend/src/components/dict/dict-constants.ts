/**
 * 字典相关常量。
 *
 * CSS_CLASS_OPTIONS:DictItem 表 cssClass 字段可选的 Antd Tag 颜色,
 * 来自 antd Tag 默认预设(blue/green/red/orange/gold/lime/cyan/purple/magenta/volcano/geekblue/default)。
 *
 * ITEM_TYPE_LABEL 暂未使用(DictType/DictItem 已自带中文字段),保留位置供后续按 typeId 分类映射。
 */

// 字典项可选颜色(Antd Tag 内置预设)
export const CSS_CLASS_OPTIONS: { value: string; label: string }[] = [
  { value: 'blue', label: 'blue' },
  { value: 'green', label: 'green' },
  { value: 'red', label: 'red' },
  { value: 'orange', label: 'orange' },
  { value: 'gold', label: 'gold' },
  { value: 'lime', label: 'lime' },
  { value: 'cyan', label: 'cyan' },
  { value: 'purple', label: 'purple' },
  { value: 'magenta', label: 'magenta' },
  { value: 'volcano', label: 'volcano' },
  { value: 'geekblue', label: 'geekblue' },
  { value: 'default', label: 'default' },
];

/** 字典项类型映射(预留,当前 DictItem 已带 label 字段)。 */
export const ITEM_TYPE_LABEL: Record<string, string> = {};
