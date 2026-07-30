export const STATUS_LABEL: Record<number, { label: string; className: string }> = {
  1: { label: 'active', className: 'tag-success' },
  0: { label: 'disabled', className: 'tag-danger' },
};

export const ROLE_COLOR: Record<string, string> = {
  admin: 'blue',
  manager: 'purple',
  service: 'cyan',
  default: 'default',
};

export const STATUS_OPTIONS = [
  { value: 1, label: 'Active' },
  { value: 0, label: 'Disabled' },
];
