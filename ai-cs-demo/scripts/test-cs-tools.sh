#!/usr/bin/env bash
#
# MCP 客服工具协议层单测:启 server,跑 14+ 个 case
# 用法:bash scripts/test-cs-tools.sh
# 退出码:0 = 全过,1 = 有失败
#
# 前置:第一次跑需要 seed FAQ 库
#   pnpm tsx scripts/seed-faq.ts
# 跑测会自动检查 + 提示
#
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
FAILED_CASES=()

# 启 server,塞 JSON-RPC,只取最后一条 JSON 响应(stdio 输出可能含 server 启动日志)
run_case() {
  local name="$1"
  local payload="$2"
  local expect_field="$3"   # e.g. '"result":' / '"isError":true' / '"ticketId":"T-'
  local expect_contains="$4" # e.g. "refund-policy.md"

  echo "── $name ──"
  local response
  response=$(timeout 20 pnpm mcp:dev 2>/dev/null <<EOF | grep -E '^\{"' | tail -1
$payload
EOF
)

  if echo "$response" | grep -q "$expect_field" && \
     { [ -z "$expect_contains" ] || echo "$response" | grep -q "$expect_contains"; }; then
    echo "  ✅ PASS"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL"
    echo "  expect: '$expect_field'  '$expect_contains'"
    echo "  got:    $(echo "$response" | head -c 400)"
    echo ""
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$name")
  fi
}

# ============ 前置:检查 FAQ 库 ============
echo "── 预检:FAQ 库大小 ──"
INFO=$(curl -s "http://localhost:9529/api/faq-info" 2>/dev/null || echo "")
if [ -z "$INFO" ]; then
  echo "  ⚠️  Next.js dev server 没起,faq-info 接口不通"
  echo "  请先: pnpm dev  (另一个终端)"
  echo "  继续测试 FAQ 检索相关 case(会失败)...或 Ctrl+C 中断先启动"
else
  COUNT=$(echo "$INFO" | grep -oE '"count":[0-9]+' | head -1 | cut -d: -f2)
  if [ "${COUNT:-0}" -lt 1 ]; then
    echo "  ⚠️  FAQ 库为空(count=$COUNT),先 seed"
    pnpm tsx scripts/seed-faq.ts 2>&1 | tail -10
  else
    echo "  ✅ FAQ 库已有 $COUNT 个块"
  fi
fi

# ============ 协议握手 ============

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}'
NOTIF='{"jsonrpc":"2.0","method":"notifications/initialized"}'

# ============ 8 个核心 case ============

# Case 1: tools/list 返回 5 工具
run_case "1. tools/list 列出 5 工具" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}" \
  '"result":' 'search_faq'

run_case "1b. tools/list 包含所有 5 个名字" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}" \
  '"result":' 'get_active_orders'

# Case 2: search_faq 命中(有 FAQ 时) — Day 9.5:source 改名 return-policy.md
run_case "2. search_faq query='如何申请退款' 命中" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"search_faq\",\"arguments\":{\"query\":\"如何申请退款\",\"topK\":3}}}" \
  '"result":' 'return-policy.md'

# Case 3: search_faq 不相关 query 返空(库里有数据但 query 无关 → total 0)
run_case "3. search_faq query='xyzabc' 返空数组" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"search_faq\",\"arguments\":{\"query\":\"xyzabc-zzz-nonsense-qq-99999\"}}}" \
  '"result":' '"total": 0'

# Case 4: get_user_order #001 命中 — 走 mock-orders,期望 contains 001
run_case "4. get_user_order orderId='#001' 命中" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_user_order\",\"arguments\":{\"orderId\":\"#001\"}}}" \
  '已付款' '已付款'

run_case "4b. get_user_order orderId='002' 不带 # 也能命中" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_user_order\",\"arguments\":{\"orderId\":\"002\"}}}" \
  '已发货' '已发货'

# Case 5: get_user_order #999 不存在
run_case "5. get_user_order orderId='#999' NOT_FOUND" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_user_order\",\"arguments\":{\"orderId\":\"#999\"}}}" \
  '"isError":true' 'NOT_FOUND'

# Case 6: get_user_order 路径穿越 → UNSAFE_INPUT
run_case "6. get_user_order orderId='../../etc/passwd' UNSAFE_INPUT" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_user_order\",\"arguments\":{\"orderId\":\"../../etc/passwd\"}}}" \
  '"isError":true' 'UNSAFE_INPUT'

run_case "6b. get_user_order orderId='abc123' 格式错" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_user_order\",\"arguments\":{\"orderId\":\"abc123\"}}}" \
  '"isError":true' 'UNSAFE_INPUT'

# Case 7: create_ticket 返回 ticketId
run_case "7. create_ticket userIssue='快递一直未到' 返回 ticketId" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"create_ticket\",\"arguments\":{\"userIssue\":\"快递一直未到,3 天了还没收到\",\"priority\":\"high\"}}}" \
  'T-2026' 'T-2026'

run_case "7b. create_ticket 缺 userIssue 参数错误" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"create_ticket\",\"arguments\":{\"priority\":\"normal\"}}}" \
  '"isError":true' ''

# Case 8: escalate_to_human 返回 escalationId
run_case "8. escalate_to_human reason='紧急:支付失败' 返回 escalationId" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"escalate_to_human\",\"arguments\":{\"reason\":\"紧急:支付失败但订单状态显示已扣款\",\"urgency\":\"urgent\"}}}" \
  'H-2026' 'H-2026'

run_case "8b. escalate_to_human reason 短(<10字) 有 warning" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"escalate_to_human\",\"arguments\":{\"reason\":\"不会用\",\"urgency\":\"normal\"}}}" \
  '"result":' 'warning'

# ============ Day 9.5: 5 工具 get_active_orders(L3 实时上下文) ============

# Case 9: tools/list 现在列 5 工具(包含 get_active_orders)
run_case "9. tools/list 列出 5 工具(新增 get_active_orders)" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}" \
  'get_active_orders' 'get_active_orders'

# Case 10: get_active_orders 不传 userId → 拉所有 active 订单
# Case 10: get_active_orders 不传 sessionKey → sessionKey 缺失 抛错(W11 C-FULL 强校验)
# 直调 MCP 必须显式传 sessionKey(走 chat route 时由 wrap 自动注入,无需传)
run_case "10. get_active_orders 无 sessionKey → INTERNAL sessionKey 缺失" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_active_orders\",\"arguments\":{}}}" \
  '"result":' 'sessionKey 缺失'

# Case 10b: get_active_orders 带 sessionKey(W11 C-FULL:sessionKey 由服务端注入,不再 demo userId)
run_case "10b. get_active_orders sessionKey='demo-session-key'" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_active_orders\",\"arguments\":{\"sessionKey\":\"demo-session-key\"}}}" \
  '"result":' 'demo-session-key'

# Case 10c: W11 C-FULL — 直调 MCP 用不存在的 sessionKey,后端反查返 cs_session 不存在
# (旧版 Case 10c 期望 mock #002 "已发货",mock 数据已在 W11 切换到真 backend 时移除)
run_case "10c. get_active_orders 直调 MCP 未知 sessionKey → 404 cs_session 不存在" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_active_orders\",\"arguments\":{\"sessionKey\":\"unknown-session-key\"}}}" \
  '"result":' 'cs_session 不存在'

# Case 10d: W11 C-FULL — 验证 sessionKey=unknown-session-key 路径走通(controller 接受 + service 反查)
run_case "10d. get_active_orders 未知 sessionKey 走完整个 pipeline" \
  "$INIT
$NOTIF
{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_active_orders\",\"arguments\":{\"sessionKey\":\"another-unknown\"}}}" \
  '"result":' 'INTERNAL'

# ============ 收口 ============

echo ""
echo "=========================="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [ $FAIL -gt 0 ]; then
  echo "失败 case:"
  for c in "${FAILED_CASES[@]}"; do echo "  - $c"; done
  exit 1
fi
echo "✅ 全过"
