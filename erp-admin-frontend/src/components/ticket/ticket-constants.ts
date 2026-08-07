/**
 * Ticket 业务常量 — 状态 / 优先级 → 颜色 + 文案 映射
 *
 * 与 backend 约定(权威来源):
 *   status:   1 待领取 / 2 处理中 / 3 已解决 / 4 已关闭
 *             (erp-admin-backend prisma/schema.prisma:214 + ticket.service.ts:38)
 *   priority: 1 高 / 2 中 / 3 低(prisma/schema.prisma:214 默认值)
 *             ⚠ cs-round-034:priority 也整体偏移 0 低 / 1 中 / 2 高 / 3 紧急,
 *               与后端不一致;留 cs-round-035 修(范围控制,本任务只修 status)
 *
 * cs-round-034:status 对齐后端 — 之前 status 错位让改状态下拉出现非法选项,
 * 用户手选 0 会触发后端 400(`status must be one of the following values: 1, 2, 3, 4`)
 */
export interface TagConf {
  c: string; // antd Tag color
  t: string; // 显示文案
}

export const TICKET_STATUS: Record<number, TagConf> = {
  1: { c: 'blue', t: '待领取' },
  2: { c: 'cyan', t: '处理中' },
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
