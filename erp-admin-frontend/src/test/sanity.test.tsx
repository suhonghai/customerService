import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

function Hello() {
  return <h1>Vitest Works</h1>;
}

describe('sanity', () => {
  it('renders a heading', () => {
    render(<Hello />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vitest Works');
  });
});
