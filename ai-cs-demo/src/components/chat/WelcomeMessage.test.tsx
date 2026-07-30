import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WelcomeMessage } from './WelcomeMessage'

describe('WelcomeMessage', () => {
  it('renders greeting and 6 quick question cards', () => {
    render(<WelcomeMessage onSelectQuestion={() => {}} />)
    expect(screen.getByText('您好,我是小服')).toBeInTheDocument()
    // 6 张卡片都能找到
    expect(screen.getByText('快递时效')).toBeInTheDocument()
    expect(screen.getByText('退换货')).toBeInTheDocument()
    expect(screen.getByText('优惠券')).toBeInTheDocument()
    expect(screen.getByText('开发票')).toBeInTheDocument()
    expect(screen.getByText('会员等级')).toBeInTheDocument()
    expect(screen.getByText('查订单')).toBeInTheDocument()
  })

  it('fires onSelectQuestion with the card question when clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<WelcomeMessage onSelectQuestion={onSelect} />)
    await user.click(screen.getByText('快递时效'))
    expect(onSelect).toHaveBeenCalledWith('快递一般几天能到?')
  })

  it('disables buttons when disabled=true', () => {
    render(<WelcomeMessage onSelectQuestion={() => {}} disabled />)
    const btn = screen.getByText('快递时效').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})