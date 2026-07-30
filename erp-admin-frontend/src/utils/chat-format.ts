/**
 * 聊天时间 / 头像文本格式化工具
 *
 * 纯函数集合,ConversationPanel 拆分的 helper 模块。
 * 供 MessageBubble / MessageGroup 等子组件复用。
 */

/** HH:mm (zh-CN) */
function timeLabel(ts: string | undefined | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 组首时间 pill:同天只 HH:mm,跨天带 MM-DD HH:mm
 * @param now 用于比较"今天"的时间基准,默认 new Date(),测试时可注入。
 */
function formatGroupTime(ts: string, now: Date = new Date()): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 相对时间:用于未来扩展(消息列表 preview / 列表页)。
 * "刚刚" / "5 分钟前" / "3 小时前" / "昨天" / "MM-DD" / 跨年 "YYYY-MM-DD"
 */
function formatRelativeTime(ts: string, now: Date = new Date()): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const diff = now.getTime() - d.getTime();
  if (diff < 0) return timeLabel(ts);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return '昨天';
  // 跨年
  if (d.getFullYear() !== now.getFullYear()) {
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

/**
 * 取访客 ID / 操作员名的缩写用于头像圆块。
 * 空值 fallback 到 defaultChar(默认 '访' / '客' / 'AI')。
 */
function getInitials(raw: string | undefined | null, fallback = '?'): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 2).toUpperCase();
}

export { timeLabel, formatGroupTime, formatRelativeTime, getInitials };
