# Spec-as-Code — 规范即测试

> 这目录是 **SSD 跨包 / 端到端 spec** 的落点。每个跨包或用户可见行为改动**先写一份 spec**,再动代码。

---

## 何时写(仅指**这目录**的 spec)

> 单包内单元 / 集成 spec **不放这里**。详见「Spec 落点分层」一节。

| 改动                                    | 是否需 spec(放本目录)                         |
| --------------------------------------- | --------------------------------------------- |
| 单文件 ≤50 行,纯重构,行为不变           | 否                                            |
| 单包内 API / UI 改动,调用者在本包内感知 | 否(放 `<子包>/test/` 或 `src/<file>.spec.ts`) |
| **用户可见行为**变了                    | 是                                            |
| 跨多个子包的改动(典型)                  | 是                                            |
| 涉及 WS / DB 落库 / 跨包副作用          | 是                                            |
| Bug 修复(跨包或用户可见)                | 是(把"应该怎样"显式写下来再修)                |

---

## Spec 落点分层(3 个落点,各管各的)

| 落点                                      | 跑法                             | 写什么                       |
| ----------------------------------------- | -------------------------------- | ---------------------------- |
| **`tests/_specs/<id>.spec.ts`**(本目录)   | `pnpm test:spec`                 | 跨包 / 端到端 / 用户可见行为 |
| `<子包>/test/<feature>.e2e-spec.ts`       | 各自 `pnpm --filter <子包> test` | 子包内集成 / 跨模块          |
| `<子包>/src/<file>.spec.ts` / `.test.tsx` | 各自 vitest / jest               | 单元 / co-located            |

**判断**:**spec 不依赖任何特定子包的实现细节** → 本目录;否则 co-located。

---

## 文件名

```
tests/_specs/<change-id>.spec.ts
```

`<change-id>` 跟三处对齐:

- Changeset / commit message 前缀:`feat(cs-round-001)` 或 `fix(cs-round-001)`
- PR 标题:`fix(erp-admin): cs-round-001 messageCount semantic aligned`
- ADR 文件(若涉及):`docs/adr/NNNN-cs-round-001-...`

---

## 格式

vitest + BDD Given/When/Then。模板:`_template.spec.ts`。

```ts
import { describe, it, expect } from "vitest";

describe("cs-round-001: messageCount semantic", () => {
  describe("Given: 全新会话 + 首条 user 消息", () => {
    describe("When: 调 POST /api/chat", () => {
      it("Then: cs_session.messageCount = 1 + cs_message 行数 = 1(user)", async () => {
        // arrange: 通过 API 或 prisma 直插 seed
        // act: send POST /api/chat with sessionKey=A
        // assert: 验 DB 状态(不是 mock state)
      });
    });
  });
});
```

每条 `Then` 必须:

- **外部可观察**(DB / HTTP response / metric / WS event),不是内部 mock 状态
- 一条 spec 对应一个用户场景,不是单元边界
- 失败时能直接告诉 stakeholder 哪里坏了

---

## 生命周期

| 状态                           | 在 frontmatter 里标                               |
| ------------------------------ | ------------------------------------------------- |
| Draft(草案)                    | `status: draft`                                   |
| Accepted(被 review + 实现)     | `status: accepted`                                |
| Implemented(commit 进 main)    | `status: implemented`                             |
| Deprecated(被另一个 spec 替代) | `status: deprecated, superseded_by: cs-round-002` |

文件本身可以加 frontmatter:

```ts
/**
 * @status accepted
 * @adr 0001
 * @changeset cs-round-001-message-count
 * @author ...
 */
```

(实际我们用 TS 注释,不是 yaml frontmatter;因为 .ts 不能挂 yaml)

---

## 跟其他文档的关系

| 文档                                            | 角色                   | 校对机制               |
| ----------------------------------------------- | ---------------------- | ---------------------- |
| **跨包 spec(`tests/_specs/<id>.spec.ts`)**      | "**测什么**(验收条件)" | CI 测试红→绿           |
| **子包内 spec(`<子包>/test/*.e2e-spec.ts`)**    | 集成 / 跨模块行为      | 各自子包 test          |
| **单元 spec(`<子包>/src/<file>.spec.ts`)**      | 单文件不变量           | 各自子包 test          |
| **变更 commit**                                 | "改了什么"             | git log / code review  |
| **`.changeset/<id>.md`**(目前没建,见 CLAUDE.md) | "用户可见变化"         | Changesets bot(将来建) |
| **CLAUDE.md 里的工程约束**                      | "约定"                 | 跟着代码走             |
| 子包 `README.md` / ai-cs-demo `docs/*-notes.md` | "现状 + 协议"          | 跟代码一致             |

**三类关系**:

- spec ↔ code:CI 自动跑(测试通 = spec 被实现)
- spec ↔ commit:commit message 引用 change-id(自动 / 半自动)
- spec ↔ stakeholder:运营 / 产品 review Draft → Accepted

---

## 子 agent 拿到 spec 怎么用

详见 `CLAUDE.md` 的"开发流程"段。简短版:

```
任务:实现 <change-id>
spec:tests/_specs/<change-id>.spec.ts

影响文件:
- <子包>/src/<path>/<file>.ts:[行号 / 函数]
- (schema 变更):prisma/schema.prisma + migrations/

你负责:
- 改实现直到 spec 全过(green)
- 在 worktree 内工作
- 完成后回报 diff stat + 测试输出
```
