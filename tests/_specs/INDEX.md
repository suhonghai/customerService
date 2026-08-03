# Spec Index — 项目所有 spec 一览

> 这是项目级 living document。**新增 spec 时,在本表加一行**;**改动 spec 时,改对应行的 status / last-updated**。
> `pnpm spec:status` 自动跑出动态面板;本表是 manual overview,显示 spec ↔ 业务 ↔ owner 关联。

---

## 索引

| spec id                                                       | 业务场景                                                      | 落点                                                         | status      | 关联代码                                                              | owner    | last-updated |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ | ----------- | --------------------------------------------------------------------- | -------- | ------------ |
| [cs-round-001](./cs-round-001-message-count-semantic.spec.ts) | 客服会话 messageCount 字段语义对齐(÷2 bug 修复)               | `erp-admin-backend/test/cs-round-001.e2e-spec.ts`(jest,已迁) | implemented | `internal.service.ts` `upsertSession` / `appendMessage`               | AI + you | 2026-07-31   |
| cs-round-002                                                  | assistant placeholder 孤儿收敛(reaper)                        | `erp-admin-backend/test/cs-round-002.e2e-spec.ts`(jest)      | implemented | `internal.service.ts` `reapStaleStreaming` + `upsertSession` 触发     | AI       | 2026-07-31   |
| cs-round-003                                                  | handoff ack 落库(刷新页面不再消失)                            | `erp-admin-backend/test/cs-round-003.e2e-spec.ts`(jest)      | implemented | `ai-cs-demo/src/app/api/chat/route.ts` handoff 分支 + `appendMessage` | AI       | 2026-07-31   |
| cs-round-004                                                  | deriveTitle PII 脱敏(身份证/手机/卡号/邮箱)                   | `ai-cs-demo/src/lib/pii-sanitize.test.ts`(vitest)            | implemented | `use-sessions.ts` `deriveTitle` + `lib/pii-sanitize.ts`               | AI       | 2026-07-31   |
| cs-round-005                                                  | 按 sessionKey 软删 no-op 友好(去掉 upsert-then-delete 副作用) | `erp-admin-backend/test/cs-round-005.e2e-spec.ts`(jest)      | implemented | `internal.service.ts` `deleteSessionByKey` + new controller endpoint  | AI       | 2026-07-31   |
| cs-round-006                                                  | appendMessage role 白名单                                     | `erp-admin-backend/test/cs-round-006.e2e-spec.ts`(jest)      | implemented | `internal.service.ts` `appendMessage`                                 | AI       | 2026-07-31   |
| fix-009                                                       | storedToUIMessage metadata.reasoning 契约(空推理不注入键)     | `tests/_specs/fix-009.spec.ts`(vitest 根)                    | implemented | `ai-cs-demo/src/lib/message-converter.ts` `storedToUIMessage`         | AI       | 2026-08-03   |
| fix-ci-008                                                    | 3 子包 .env.test.example 入仓 + pr-e2e 自动复制               | `tests/_specs/fix-ci-008.spec.ts`(vitest 根)                 | implemented | `pr-e2e.yml` + `ai-cs-demo/.gitignore` + 3 份子包模板                 | AI       | 2026-08-03   |

> 注:`cs-round-001` / `cs-round-002` 的 spec 已根据 §D / P-1 结论从根 `tests/_specs/` 迁到 `erp-admin-backend/test/`(jest 路径)。根目录放的是 redirect 引用。

---

## 怎么用这张表

- **新增 spec**:加一行,填业务场景 + 落点路径 + status(初始 `draft`)
- **改 spec**:`@status` 注释改 → 表里 status 改 + 更新 last-updated
- **废弃 spec**:`@status deprecated` → 表里 status 改 + 加 superseded_by 引用
- **月度 review**:owner 过一遍这张表,把 90+ 天未动的 draft 处理掉(推动 / 改需求 / 删)

## Living Spec 生命周期

```
draft
  ↓(写完 + 改实现 + spec 跑通)
accepted
  ↓(commit [change-id] 进 main,实现合并)
implemented
  ↓(后续需求 supersede 这个)
deprecated → superseded_by 引用新 spec id
```

工具支撑(在 ssd-status.md 跟):

- `@status` 注释:`pnpm spec:status` 报告
- commit [change-id]:commit-msg hook 校验 spec 文件存在
- PR review 段:Action 强制勾选 quality rules
- CI:vitest 跑根 spec + pr-e2e 跑后端 jest + spec:audit 报告漂移

这 4 块合起来,spec **是单一真相** + **活文档** + **自动守门**。
