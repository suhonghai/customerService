import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginHero } from './LoginHero';

describe('<LoginHero />', () => {
  it('渲染 brand mark + heading + subtext + footer', () => {
    render(<LoginHero dateStr="Jul 16, 2026" />);

    // Brand mark
    expect(screen.getByText('W11')).toBeTruthy();
    expect(screen.getByText('ERP')).toBeTruthy();
    expect(screen.getByText('v0.1')).toBeTruthy();

    // Hero heading
    expect(screen.getByText(/A quieter way/i)).toBeTruthy();
    expect(screen.getByText(/run the floor/i)).toBeTruthy();

    // 副文案
    expect(screen.getByText(/一套克制的内部运营系统/)).toBeTruthy();

    // Footer
    expect(screen.getByText(/v0\.1\.0 · production/)).toBeTruthy();
    expect(screen.getByText(/All systems operational/i)).toBeTruthy();
  });

  it('dateStr 传入即显示在 brand 下方(corporate operations · <date>)', () => {
    render(<LoginHero dateStr="Jul 16, 2026" />);
    expect(screen.getByText(/\/\/ corporate operations · Jul 16, 2026/)).toBeTruthy();
  });

  it('不同 dateStr 切换时正确反映', () => {
    const { rerender } = render(<LoginHero dateStr="Jan 1, 2026" />);
    expect(screen.getByText(/\/\/ corporate operations · Jan 1, 2026/)).toBeTruthy();

    rerender(<LoginHero dateStr="Dec 31, 2099" />);
    expect(screen.getByText(/\/\/ corporate operations · Dec 31, 2099/)).toBeTruthy();
  });
});
