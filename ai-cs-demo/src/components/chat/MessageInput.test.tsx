import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageInput } from './MessageInput'

describe('MessageInput', () => {
  it('calls onChange when user types', async () => {
    const user = userEvent.setup()
    // 用受控包装:value 由 onChange 累积,模拟真实的 React 状态
    function Controlled() {
      const [v, setV] = React.useState('')
      return (
        <MessageInput
          value={v}
          onChange={setV}
          onSubmit={() => {}}
          isLoading={false}
          onStop={() => {}}
        />
      )
    }
    render(<Controlled />)
    const ta = screen.getByPlaceholderText('说点什么...')
    await user.type(ta, 'hi')
    expect(ta).toHaveValue('hi')
  })

  it('calls onSubmit when the send button is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <MessageInput
        value="hello"
        onChange={() => {}}
        onSubmit={onSubmit}
        isLoading={false}
        onStop={() => {}}
      />,
    )
    await user.click(screen.getByTestId('send-btn'))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('disables the send button when value is empty', () => {
    render(
      <MessageInput
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        isLoading={false}
        onStop={() => {}}
      />,
    )
    expect((screen.getByTestId('send-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows stop button when isLoading and calls onStop', async () => {
    const user = userEvent.setup()
    const onStop = vi.fn()
    render(
      <MessageInput
        value="正在流"
        onChange={() => {}}
        onSubmit={() => {}}
        isLoading
        onStop={onStop}
      />,
    )
    expect(screen.queryByTestId('send-btn')).toBeNull()
    await user.click(screen.getByTestId('stop-btn'))
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('Enter (without shift) submits, Shift+Enter does not', () => {
    const onSubmit = vi.fn()
    render(
      <MessageInput
        value="abc"
        onChange={() => {}}
        onSubmit={onSubmit}
        isLoading={false}
        onStop={() => {}}
      />,
    )
    const ta = screen.getByPlaceholderText('说点什么...')
    // cs-round-061:Enter 路径走 HTML spec implicit submission(form 有 default
    // submit button 时,Enter 模拟 click 该 button → 触发 native submit event
    // → React 调度 form onSubmit → handleSubmit → onSubmit 1 次)。jsdom 不模拟
    // implicit submission,所以这里先 fireEvent.keyDown(测 preventDefault 行为)
    // 再 fireEvent.submit(测 form onSubmit 触发链路)— 模拟真实浏览器路径。
    fireEvent.keyDown(ta, { key: 'Enter' })
    // 模拟浏览器 implicit form submission
    const form = ta.closest('form')!
    fireEvent.submit(form)
    expect(onSubmit).toHaveBeenCalledOnce()
    // Shift+Enter:preventDefault 阻止 implicit submit,onSubmit 不 +1
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSubmit).toHaveBeenCalledOnce()  // 没再 +1
  })
})