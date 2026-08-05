# Spec Index — 项目所有 spec 一览

> 这是项目级 living document。**新增 spec 时,在本表加一行**;**改动 spec 时,改对应行的 status / last-updated**。
> `pnpm spec:status` 自动跑出动态面板;本表是 manual overview,显示 spec ↔ 业务 ↔ owner 关联。

---

## 索引

| spec id                                                       | 业务场景                                                                | 落点                                                                                                          | status      | 关联代码                                                                                                       | owner    | last-updated |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- | -------- | ------------ |
| [cs-round-001](./cs-round-001-message-count-semantic.spec.ts) | 客服会话 messageCount 字段语义对齐(÷2 bug 修复)                         | `erp-admin-backend/test/cs-round-001.e2e-spec.ts`(jest,已迁)                                                  | implemented | `internal.service.ts` `upsertSession` / `appendMessage`                                                        | AI + you | 2026-07-31   |
| cs-round-002                                                  | assistant placeholder 孤儿收敛(reaper)                                  | `erp-admin-backend/test/cs-round-002.e2e-spec.ts`(jest)                                                       | implemented | `internal.service.ts` `reapStaleStreaming` + `upsertSession` 触发                                              | AI       | 2026-07-31   |
| cs-round-003                                                  | handoff ack 落库(刷新页面不再消失)                                      | `erp-admin-backend/test/cs-round-003.e2e-spec.ts`(jest)                                                       | implemented | `ai-cs-demo/src/app/api/chat/route.ts` handoff 分支 + `appendMessage`                                          | AI       | 2026-07-31   |
| cs-round-004                                                  | deriveTitle PII 脱敏(身份证/手机/卡号/邮箱)                             | `ai-cs-demo/src/lib/pii-sanitize.test.ts`(vitest)                                                             | implemented | `use-sessions.ts` `deriveTitle` + `lib/pii-sanitize.ts`                                                        | AI       | 2026-07-31   |
| cs-round-005                                                  | 按 sessionKey 软删 no-op 友好(去掉 upsert-then-delete 副作用)           | `erp-admin-backend/test/cs-round-005.e2e-spec.ts`(jest)                                                       | implemented | `internal.service.ts` `deleteSessionByKey` + new controller endpoint                                           | AI       | 2026-07-31   |
| cs-round-006                                                  | appendMessage role 白名单                                               | `erp-admin-backend/test/cs-round-006.e2e-spec.ts`(jest)                                                       | implemented | `internal.service.ts` `appendMessage`                                                                          | AI       | 2026-07-31   |
| fix-009                                                       | storedToUIMessage metadata.reasoning 契约(空推理不注入键)               | `tests/_specs/fix-009.spec.ts`(vitest 根)                                                                     | implemented | `ai-cs-demo/src/lib/message-converter.ts` `storedToUIMessage`                                                  | AI       | 2026-08-03   |
| fix-ci-008                                                    | 3 子包 .env.test.example 入仓 + pr-e2e 自动复制                         | `tests/_specs/fix-ci-008.spec.ts`(vitest 根)                                                                  | implemented | `pr-e2e.yml` + `ai-cs-demo/.gitignore` + 3 份子包模板                                                          | AI       | 2026-08-03   |
| cs-round-011                                                  | 流式回复抗中断 — 后端继续生成 / 抖动重试 / status 分发渲染              | `tests/_specs/cs-round-011.spec.ts`(vitest 根,跨包) + `erp-admin-backend/test/cs-round-011.e2e-spec.ts`(jest) | implemented | `ai-cs-demo/src/app/api/chat/route.ts` `withStreamRetry` + `continueFromMessageId` + `refetch-history.ts`      | AI       | 2026-08-05   |
| cs-round-014                                                  | 修复 sidebar 点击会话 → /chat/undefined(后端 listSessions 漏 select id) | `tests/_specs/cs-round-014.spec.ts`(vitest 根,跨包) + `erp-admin-backend/test/cs-round-014.e2e-spec.ts`(jest) | implemented | `internal.service.ts` `listSessions` select + map + `internal.controller.ts` 返回类型 + `SessionList.tsx` 守卫 | AI       | 2026-08-05   |

> 注:`cs-round-001` / `cs-round-002` 的 spec 已根据 §D / P-1 结论从根 `tests/_specs/` 迁到 `erp-admin-backend/test/`(jest 路径)。根目录放的是 redirect 引用。

---

## 怎么用这张表

- **新增 spec**:加一行,填业务场景 + 落点路径 + status(初始 `draft`)
- **改 spec**:`@status` 注释改 → 表里 status 改 + 更新 last-updated
- **废弃 spec**:`@status deprecated` → 表里 status 改 + 加 superseded_by 引用
- **月度 review**:owner 过一遍这张表,把 90+ 天未动的 draft 处理掉(推动 / 改需求 / 删)

### Incident spec 行格式约定(2026-08-05 加)

> 事故回灌 spec —— 把生产事故反向写入 spec 流,让事故复盘成为活文档的一等公民(对应 ThoughtWorks "Bidirectional Feedback")。
> 模板:`tests/_specs/INCIDENT-TEMPLATE.spec.ts`(复制改名后填)。

| 字段              | 位置                                                           | 示例                                                        |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| 文件名            | `tests/_specs/`                                                | `incident-<NNN>-<slug>.spec.ts`(`NNN` 3 位,slug kebab-case) |
| header            | `/**` 块                                                       | `@status incident-recorded` → `accepted` → `implemented`    |
| header            | 同上                                                           | `@incident-id <biz-id>`(W11 / Jira / 内部 ticket)           |
| header            | 同上                                                           | `@incident-date YYYY-MM-DD`                                 |
| header            | 同上                                                           | `@fixed-by <short-sha>` 修复 commit 短 hash                 |
| header            | 同上                                                           | `@root-cause <一句话>`                                      |
| INDEX.md 表格一行 | 业务场景列填 `🚨 incident: <一句话>`, 关联代码列填修复文件路径 | (跟普通 spec 共用一张表;字段语义统一)                       |

**生命周期多一类**:普通 spec `draft → accepted → implemented → deprecated`。Incident spec 多一步 `incident-recorded`(刚发时)+ 永远留 `implemented` 不变(作为历史锚点)。详见「Living Spec 生命周期」段。

**实战 demo**:`tests/_specs/incident-cs-round-014.spec.ts`(填自 cs-round-014 /chat/undefined 修复)。

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
