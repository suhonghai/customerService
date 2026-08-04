# Sub-agent 回包模板

> **目的**:强制 sub-agent 回 parent 时**只填这个模板**,不准自由发挥。
> 节省 context:sub-agent 回包 ≤ 30 行,parent 直接读不展开。
> **使用方**:每次 Agent/Task 工具的 brief 最后一行附:
> 「回包必须严格按 `scripts/SUBAGENT_RETURN.template.md` 格式,不准自由发挥。」

---

## 模板正文(必填,缺项写 N/A)

```markdown
## [<change-id>] done

### Files

- path/to/file.ts (+X/-Y)
- path/to/file2.ts (+X/-Y)

### Tests

- <N> scenarios pass, <M> fail
- [仅列失败场景标题 + 关键 error 行前 3 行,不要全贴输出]

### Smoke

- <具体命令 + 期望输出片段>

### Side effects

- [env / schema / API / dependency 变更]

### Open questions

- [需要 parent / user 拍板的点;无则写 N/A]
```

---

## 完整示例

```markdown
## [cs-round-007] done

### Files

- erp-admin-backend/src/modules/ws/realtime.gateway.ts (+45/-12)
- ai-cs-demo/src/lib/realtime-client.ts (+8/-3)
- .env.test.example (+2/-0)

### Tests

- 4 scenarios pass, 0 fail
- (无失败)

### Smoke

- `make dev-all` → 3 子包启动正常
- `curl http://localhost:3001/health` → `{"ok":true}`

### Side effects

- INTERNAL_TOKEN 在 .env.test.example 3 处保持一致(根/backend/ai-cs-demo)
- gateway 新增 disconnect 路径,fork PR 需 `pull-requests:write` 否则 sticky comment 失败

### Open questions

- N/A
```

---

## 反模式(直接打回重做)

❌ **完整 diff 粘贴**(80+ 行 raw `git diff` 输出)
❌ **完整 test 输出**(几百行 jest/vitest 原始输出)
❌ **完整源文件粘贴**(重复 brief 里已经给过的 file:line)
❌ **自由叙事**("我改了 gateway 然后发现 token 校验有问题于是..." —— 叙事不是信息)
❌ **超过 30 行**(任何字段长篇大论 = 偷懒没压缩)

---

## 为什么是硬约束

CLAUDE.md 第 79-83 行已经写明 sub-agent 协议,但**没模板文件**。
parent agent 每次等回包,要花 ~50-150 行 context 解析自由格式的输出。

强制模板后:

- sub-agent 回包从 ~80-150 行 → **~25 行**(3-5 倍压缩)
- parent 不用做格式解析,直接读字段
- 字段缺失 = 一眼能看出 sub-agent 漏报了什么

---

## 维护规则

- **不要往这个文件加新字段**(除非 ≥3 次实际回包证明新字段必要)
- **示例用最近一次真回包**(保持鲜活,避免示例过时)
- **改反模式清单**只增不减(增的写新反模式,不删旧的)
