/**
 * AvatarBlock — 微信风格 40×40 圆角方块头像
 *
 * 拆分自 ConversationPanel.tsx 的内联 Avatar 组件。
 * 三色(客户蓝 / 运营绿 / AI 红)在调用方传入。
 */

export interface AvatarBlockProps {
  text: string;
  bg: string;
}

export default function AvatarBlock({ text, bg }: AvatarBlockProps) {
  return (
    <div
      data-testid="chat-avatar"
      data-bg={bg}
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        flexGrow: 0,
        background: bg,
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        letterSpacing: 0.2,
      }}
    >
      {text}
    </div>
  );
}
