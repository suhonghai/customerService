import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InterruptBanner } from './InterruptBanner'

describe('InterruptBanner', () => {
  it('shows "继续生成" when isInterrupted and has text', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    render(
      <InterruptBanner
        hasText
        isInterrupted
        onContinue={onContinue}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText(/上次回答没写完/)).toBeInTheDocument()
    await user.click(screen.getByTestId('continue-btn'))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('shows "重试" when not isInterrupted (local loss)', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <InterruptBanner
        hasText={false}
        isInterrupted={false}
        onContinue={() => {}}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByText(/上次回答没收到完整内容/)).toBeInTheDocument()
    await user.click(screen.getByTestId('retry-btn'))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows "没写完" variant when isInterrupted but no text', () => {
    render(
      <InterruptBanner
        hasText={false}
        isInterrupted
        onContinue={() => {}}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText(/上次回答没收到完整内容/)).toBeInTheDocument()
    expect(screen.getByTestId('continue-btn')).toBeInTheDocument()
  })
})