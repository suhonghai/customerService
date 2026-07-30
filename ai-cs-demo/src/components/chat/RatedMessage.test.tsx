import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RatedMessage } from './RatedMessage'

describe('RatedMessage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders nothing when no rating exists', async () => {
    const { container } = render(<RatedMessage messageId="m-1" />)
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('renders 👍 已点赞 when rating is "up"', async () => {
    window.localStorage.setItem('cs_ratings', JSON.stringify({ 'm-1': 'up' }))
    render(<RatedMessage messageId="m-1" />)
    expect(await screen.findByText('👍 已点赞')).toBeInTheDocument()
  })

  it('renders 👎 已点踩 when rating is "down"', async () => {
    window.localStorage.setItem('cs_ratings', JSON.stringify({ 'm-1': 'down' }))
    render(<RatedMessage messageId="m-1" />)
    expect(await screen.findByText('👎 已点踩')).toBeInTheDocument()
  })
})