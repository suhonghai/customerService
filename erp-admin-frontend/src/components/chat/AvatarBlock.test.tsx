import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AvatarBlock from './AvatarBlock';

describe('AvatarBlock', () => {
  it('renders provided text inside a 40x40 colored block', () => {
    const { container } = render(<AvatarBlock text="客" bg="#07C060" />);
    const el = screen.getByTestId('chat-avatar');
    expect(el).toHaveTextContent('客');
    expect(el).toHaveAttribute('data-bg', '#07C060');
    // inline style background
    expect((container.firstChild as HTMLElement).style.background).toBeTruthy();
  });

  it('applies different background per color (customer vs operator vs AI)', () => {
    const { rerender, container } = render(<AvatarBlock text="V1" bg="#5B6FED" />);
    expect(container.firstChild).toHaveAttribute('data-bg', '#5B6FED');

    rerender(<AvatarBlock text="客" bg="#07C060" />);
    expect(container.firstChild).toHaveAttribute('data-bg', '#07C060');

    rerender(<AvatarBlock text="AI" bg="#FF6B6B" />);
    expect(container.firstChild).toHaveAttribute('data-bg', '#FF6B6B');
  });

  it('renders the text verbatim (no truncation inside this component)', () => {
    render(<AvatarBlock text="VIS" bg="#000" />);
    expect(screen.getByTestId('chat-avatar')).toHaveTextContent('VIS');
  });
});
