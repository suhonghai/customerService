/**
 * Antd 5.20+ Modal/Drawer 改用 destroyOnHidden
 *
 * 早期 antd 5.x 用 destroyOnClose(关闭时销毁内部 state)。
 * 5.20 起官方把 destroyOnClose 标为 deprecated,并提供语义更清晰的
 * destroyOnHidden(关闭且未显示时销毁内部 state)。
 *
 * 这里给一个常量集中引用,后续如果官方再次重命名只改这一处。
 *
 * 用法:
 *   import { MODAL_DESTROY_PROP } from '@/utils/antd-compat';
 *   <Modal {...{ [MODAL_DESTROY_PROP]: true }} />
 */
export const MODAL_DESTROY_PROP = 'destroyOnHidden' as const;
