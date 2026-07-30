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
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledOnce()
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSubmit).toHaveBeenCalledOnce()  // 没再 +1
  })
})