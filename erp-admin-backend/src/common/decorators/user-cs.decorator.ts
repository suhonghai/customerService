import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUserCs() 装饰器:从 request.csCustomer 拿当前 C 端登录客户
 *
 * 与 @CurrentUser()(读 request.user)平行,完全独立命名空间。
 * CsJwtAuthGuard 校验通过后会把 customer 挂到 request.csCustomer。
 *
 * 使用:
 *   @Get('me')
 *   @UseGuards(CsJwtAuthGuard)
 *   async me(@CurrentUserCs() customer: ICsCurrentUser) { ... }
 *
 *   // 拿特定字段
 *   async me(@CurrentUserCs('id') customerId: number) { ... }
 */
export interface ICsCurrentUser {
  id: number;
  email: string;
  nickname: string | null;
  phone: string | null;
}

export const CurrentUserCs = createParamDecorator(
  (data: keyof ICsCurrentUser | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest();
    const customer: ICsCurrentUser | undefined = request.csCustomer;
    if (!customer) return undefined;
    return data ? customer[data] : customer;
  },
);
