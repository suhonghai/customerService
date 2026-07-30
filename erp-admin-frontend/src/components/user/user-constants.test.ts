import { describe, expect, it } from 'vitest';
import { ROLE_COLOR, STATUS_LABEL } from './user-constants';

describe('user constants', () => {
  it('maps user status labels', () => {
    expect(STATUS_LABEL[1]).toEqual({ label: 'active', className: 'tag-success' });
    expect(STATUS_LABEL[0]).toEqual({ label: 'disabled', className: 'tag-danger' });
  });

  it('provides stable role colors and a fallback', () => {
    expect(ROLE_COLOR.admin).toBe('blue');
    expect(ROLE_COLOR.default).toBe('default');
  });
});
