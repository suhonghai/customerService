import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FAQList } from './FAQList'

const ITEMS = [
  { icon: '📦', title: '快递时效', question: '几天到?' },
  { icon: '🔄', title: '退换货', question: '怎么退?' },
]

describe('FAQList', () => {
  it('renders all items', () => {
    render(<FAQList items={ITEMS} onSelect={() => {}} />)
    expect(screen.getByText('快递时效')).toBeInTheDocument()
    expect(screen.getByText('退换货')).toBeInTheDocument()
    expect(screen.getByText('几天到?')).toBeInTheDocument()
    expect(screen.getByText('怎么退?')).toBeInTheDocument()
  })

  it('calls onSelect with the clicked question', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<FAQList items={ITEMS} onSelect={onSelect} />)
    await user.click(screen.getByText('快递时效'))
    expect(onSelect).toHaveBeenCalledWith('几天到?')
  })

  it('disables all buttons when disabled=true', () => {
    render(<FAQList items={ITEMS} onSelect={() => {}} disabled />)
    const btns = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(btns.every((b) => b.disabled)).toBe(true)
  })
})