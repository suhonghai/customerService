'use client'

import { useState, type FormEvent } from 'react'
import type { Session } from '@/hooks/use-sessions'

interface SessionListProps {
  sessions: Session[]
  activeId: string | null
  onSwitch: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

/** 渲染 "x 分钟前 / x 小时前 / x 天前" 这种相对时间,中文,简洁 */
function relativeTime(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * SessionList:左侧会话列表
 *
 * 视觉风格:Intercom / Zendesk 风格的紧凑 sidebar
 * - 顶部「+ 新会话」按钮(全宽,主色)
 * - 列表项:标题(truncate 1 行)+ 副标题(消息数 · 相对时间)
 * - 当前 active:bg-blue-50 + 左边蓝条
 * - hover 显示「✏️ 重命名」「🗑️ 删除」图标
 * - inline 编辑:点 ✏️ → input,Enter / blur 保存,Esc 取消
 */
export function SessionList({
  sessions,
  activeId,
  onSwitch,
  onCreate,
  onDelete,
  onRename,
}: SessionListProps) {
  // 哪条正在被 inline 编辑(只允许同时 1 条)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  function startEdit(s: Session) {
    setEditingId(String(s.id))
    setEditingValue(s.title)
  }

  function commitEdit() {
    if (editingId && editingValue.trim()) {
      onRename(editingId, editingValue.trim())
    }
    setEditingId(null)
    setEditingValue('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingValue('')
  }

  function handleDeleteClick(s: Session) {
    const msg = `确认删除会话「${s.title}」?此操作不可恢复。`
    if (confirm(msg)) onDelete(String(s.id))
  }

  return (
    <aside
      className="h-full flex flex-col border-r bg-[var(--surface-elevated)]"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* 顶部:Logo 区 + 新建按钮 */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3 px-1">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-base"
            style={{
              background:
                'linear-gradient(135deg, var(--brand-primary) 0%, #ff8a5b 100%)',
            }}
          >
            🛍️
          </span>
          <div className="min-w-0">
            <div
              className="display font-bold text-[15px] leading-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              小服客服
            </div>
            <div
              className="text-[11px] truncate"
              style={{ color: 'var(--text-tertiary)' }}
            >
              智能购物助手
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="w-full rounded-xl text-white py-3 font-semibold active:scale-95 transition-all shadow-sm"
          style={{
            background: 'var(--brand-primary)',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background =
              'var(--brand-primary-hover)'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background =
              'var(--brand-primary)'
          }}
        >
          + 新会话
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div
            className="text-xs text-center py-6 px-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            还没有会话
          </div>
        ) : (
          <ul className="py-2">
            {sessions.map(s => {
              const isActive = String(s.id) === activeId
              const isEditing = String(s.id) === editingId
              // cs-round-013:messageCount 来自后端字段(不在前端持久化 messages)
              const messageCount = s.messageCount
              return (
                <li
                  key={s.id}
                  className={`group relative mx-2 my-0.5 rounded-xl transition-colors ${
                    isActive
                      ? 'border-l-2'
                      : 'hover:bg-[var(--brand-primary-soft)] border-l-2 border-transparent'
                  }`}
                  style={
                    isActive
                      ? {
                          background: 'var(--brand-primary-soft)',
                          borderLeftColor: 'var(--brand-primary)',
                        }
                      : undefined
                  }
                >
                  {isEditing ? (
                    <form
                      className="px-2 py-1.5"
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault()
                        commitEdit()
                      }}
                    >
                      <input
                        autoFocus
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelEdit()
                          }
                        }}
                        className="w-full text-sm rounded px-2 py-1 focus:outline-none focus:ring-2"
                        style={{
                          border: '1px solid var(--brand-primary)',
                          color: 'var(--text-primary)',
                        }}
                        placeholder="会话标题"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        // cs-round-014:守卫 — 后端契约漏 id 时 (s.id === undefined) 不能拼出 /chat/undefined
                        if (s.id == null) return;
                        onSwitch(String(s.id));
                      }}
                      className="w-full text-left px-3 py-2.5 pr-14 cursor-pointer transition-colors"
                      title={s.title}
                    >
                      <div
                        className={`text-sm truncate ${
                          isActive ? 'font-semibold' : ''
                        }`}
                        style={{
                          color: isActive
                            ? 'var(--brand-primary-hover)'
                            : 'var(--text-primary)',
                        }}
                      >
                        {s.title}
                      </div>
                      <div
                        className="text-[11px] mt-0.5 flex items-center gap-1.5"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <span>
                          {messageCount === 0
                            ? '空'
                            : `${messageCount} 条消息`}
                        </span>
                        <span style={{ color: 'var(--border-strong)' }}>
                          ·
                        </span>
                        <span>{relativeTime(s.updatedAt)}</span>
                      </div>
                    </button>
                  )}

                  {/* hover 显示的操作图标(绝对定位右上角) */}
                  {!isEditing && (
                    <div
                      className={`absolute right-1 top-1.5 flex gap-0.5 ${
                        isActive
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      } transition-opacity`}
                    >
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          startEdit(s)
                        }}
                        className="px-1 py-0.5 text-xs rounded transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={e => {
                          ;(e.currentTarget as HTMLButtonElement).style.color =
                            'var(--brand-primary)'
                        }}
                        onMouseLeave={e => {
                          ;(e.currentTarget as HTMLButtonElement).style.color =
                            'var(--text-secondary)'
                        }}
                        title="重命名"
                        aria-label="重命名会话"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          handleDeleteClick(s)
                        }}
                        className="px-1 py-0.5 text-xs rounded transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={e => {
                          ;(e.currentTarget as HTMLButtonElement).style.color =
                            'var(--error)'
                        }}
                        onMouseLeave={e => {
                          ;(e.currentTarget as HTMLButtonElement).style.color =
                            'var(--text-secondary)'
                        }}
                        title="删除"
                        aria-label="删除会话"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 底部:统计 */}
      <div
        className="px-4 py-3 border-t text-[11px]"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--text-tertiary)',
        }}
      >
        共 {sessions.length} 个会话
      </div>
    </aside>
  )
}
