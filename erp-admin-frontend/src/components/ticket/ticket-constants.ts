/**
 * Ticket 业务常量 — 状态 / 优先级 → 颜色 + 文案 映射
 *
 * 与 backend 约定:
 *   status:   0 待处理 / 1 处理中 / 2 待客户 / 3 已解决 / 4 已关闭
 *   priority: 0 低 / 1 中 / 2 高 / 3 紧急
 */
export interface TagConf {
  c: string; // antd Tag color
  t: string; // 显示文案
}

export const TICKET_STATUS: Record<number, TagConf> = {
  0: { c: 'default', t: '待处理' },
  1: { c: 'blue', t: '处理中' },
  2: { c: 'cyan', t: '待客户' },
  3: { c: 'green', t: '已解决' },
  4: { c: 'red', t: '已关闭' },
};

export const TICKET_PRIORITY: Record<number, TagConf> = {
  0: { c: 'default', t: '低' },
  1: { c: 'blue', t: '中' },
  2: { c: 'orange', t: '高' },
  3: { c: 'red', t: '紧急' },
};

/**
 * 兜底映射:未知 status / priority 时给用户一个可读的"未知"标签
 */
export const UNKNOWN_STATUS: TagConf = { c: 'default', t: '未知' };
export const UNKNOWN_PRIORITY: TagConf = { c: 'default', t: '?' };
