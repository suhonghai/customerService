/**
 * Spec template(SSD / BDD / Given-When-Then)
 *
 * 用法:
 *   1) cp _template.spec.ts <change-id>.spec.ts
 *   2) 改 describe 名字 = change-id
 *   3) Given/When/Then 改成你这次改动的场景
 *   4) 跑 `pnpm --filter <子包> test <change-id>` 应该 RED
 *   5) 改实现,直到 GREEN
 *
 * @status draft
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('<change-id>: <一句话标题>', () => {
  // 每个 spec 前重置状态(truncate 相关表 / 清 mock / 重新 seed)
  beforeEach(() => {
    // ...
  });

  afterEach(() => {
    // ...
  });

  // ── Scenario 1: happy path(必填)────────────────────
  describe('Given <初始状态>', () => {
    describe('When <触发动作 / 输入>', () => {
      it('Then <可观察结果 1>', async () => {
        // arrange
        // act
        // assert — 必须是外部可观察(DB / HTTP / metric),不是内部 mock
      });

      it('Then <可观察结果 2>', async () => {
        // ...
      });
    });
  });

  // ── Scenario 2: 边界 / 失败(至少一条)──────────────
  describe('Given <异常状态>', () => {
    describe('When <触发动作>', () => {
      it('Then <错误码 / 副作用>', async () => {
        // ...
      });
    });
  });

  // ── Scenario 3: 跨包 / 跨模块(若涉及)──────────────
  describe('Given <前后端双侧初始>', () => {
    describe('When <前端调 + 后端处理>', () => {
      it('Then <前端看到 + 后端落 DB>', async () => {
        // ...
      });
    });
  });
});
