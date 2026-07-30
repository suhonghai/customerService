import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务异常
 *
 * 使用:
 *   throw new BizException(40001, '用户名已存在');
 *   throw new BizException(20001, '参数错误', { field: 'username' });
 */
export class BizException extends HttpException {
  constructor(
    public readonly bizCode: number,
    message: string,
    public readonly data: unknown = null,
  ) {
    super({ bizCode, message, data }, HttpStatus.OK); // 业务异常 HTTP 仍 200,前端靠 code 判失败
  }
}

/**
 * 常用业务码常量(参考 03-api-spec.md 第 1.5 节)
 * 类型 number,方便赋值给 let code: number
 */
export const BizCode: { readonly [k: string]: number } = {
  SUCCESS: 0,
  UNAUTHORIZED: 10001,
  TOKEN_EXPIRED: 10002,
  REFRESH_EXPIRED: 10003,
  FORBIDDEN: 10101,
  NO_PERMISSION: 10102,
  PARAM_ERROR: 20001,
  PARAM_MISSING: 20002,
  USER_NOT_FOUND: 30001,
  ROLE_NOT_FOUND: 30002,
  ORDER_NOT_FOUND: 30003,
  FAQ_NOT_FOUND: 30004,
  TICKET_NOT_FOUND: 30005,
  BAD_REQUEST: 1400,
  NOT_FOUND: 1404,
  USERNAME_EXISTS: 40001,
  BIZ_ERROR: 40002,
  STATE_NOT_ALLOW: 40003,
  SERVER_ERROR: 50000,
};
