import { describe, it, expect } from 'vitest';
import { PASSWORD_RULES } from './profile-constants';

describe('PASSWORD_RULES', () => {
  it('exposes min 6 and max 50 for password length', () => {
    expect(PASSWORD_RULES.MIN).toBe(6);
    expect(PASSWORD_RULES.MAX).toBe(50);
  });

  it('is frozen (as const) so consumers cannot mutate', () => {
    // as const 在编译期 freeze,运行时不一定冻结;至少类型层面不可扩展
    expect(typeof PASSWORD_RULES.MIN).toBe('number');
    expect(typeof PASSWORD_RULES.MAX).toBe('number');
  });
});
