import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('renders a heading', () => {
    render(<h1>Vitest Works</h1>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vitest Works');
  });
});