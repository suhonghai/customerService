/** 登录页 demo 账号(点击 chip 自动填充表单) */
export interface DemoAccount {
  username: string;
  password: string;
  label: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'admin', password: 'Admin@123', label: '超级管理员' },
  { username: 'agent_lead01', password: 'Lead@123', label: '客服主管' },
  { username: 'editor01', password: 'Editor@123', label: '内容编辑' },
];

/** 登录表单提交参数 */
export interface LoginFormValues {
  username: string;
  password: string;
}
