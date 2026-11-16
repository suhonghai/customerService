#!/usr/bin/env bash
# =============================================================================
# W11 ERP Admin — SSL 证书到期巡检脚本
# 由 install.sh 装到 cron(每天 9:00 跑一次,跟 3:30 的 renew-ssl.sh 错开)
#
# 为什么需要它:
#   renew-ssl.sh 续期失败时只往 syslog 写一行,没人主动看就等于没有告警 ——
#   2026-11 就是这么静默失败 95 天,证书过期了才发现。本脚本做【主动巡检】:
#   证书剩余 < 阈值(或已过期)就告警 + 非 0 退出,让 cron 立刻感知。
#
# 阈值 20 天的由来:
#   certbot --keep-until-expiring 的续期窗口是「剩余 < 30 天」才真正续期,
#   所以正常链路上证书永远 >= 30 天。掉到 < 20 天,意味着续期链已经断了至少
#   10 天 —— 这已经不是「快到期」,而是「续期机制坏了」,必须告警。
#
# 实现要点:
#   - 不依赖 certbot 容器,纯 openssl 读本地证书文件(certbot 容器挂了也能查)
#   - SSL_DIR / LOG_DIR / LOG_FILE / WARN_DAYS / SSL_ALERT_WEBHOOK 均可环境变量覆盖
#   - SSL_ALERT_WEBHOOK 为空 → 完全跳过 webhook 这段,零外部依赖
#
# 退出码:
#   0 = 全部证书 >= 阈值(健康)
#   1 = 有证书 < 阈值 / 已过期 / 一张证书都没找到
# =============================================================================

set -euo pipefail

SSL_DIR="${SSL_DIR:-/opt/w11-erp/ssl}"
LOG_DIR="${LOG_DIR:-/opt/w11-erp/logs}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/cert-expiry.log}"
# 告警阈值(天)。certbot 续期窗口 30 天,这里取 20 天留 10 天缓冲。
WARN_DAYS="${WARN_DAYS:-20}"
# 可选告警 webhook(飞书群机器人)。为空则完全不推。
SSL_ALERT_WEBHOOK="${SSL_ALERT_WEBHOOK:-}"
# webhook URL 放在服务器上的独立 env 文件里(不入 git):
#   /opt/w11-erp/.env.ssl-alert  内容一行  export SSL_ALERT_WEBHOOK=https://...
# 同一台机器上的其它项目(如 baobaotao-watcher)已经在用飞书机器人,
# 直接复用同一个群机器人即可,不必再申请一个。
SSL_ALERT_ENV_FILE="${SSL_ALERT_ENV_FILE:-/opt/w11-erp/.env.ssl-alert}"
if [ -z "$SSL_ALERT_WEBHOOK" ] && [ -f "$SSL_ALERT_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$SSL_ALERT_ENV_FILE"
fi

LOG_TAG="[cert-expiry]"
SYSLOG_TAG="ssl-cert"
WARN_SECONDS=$((WARN_DAYS * 86400))

# stdout 已经被重定向到 LOG_FILE 时(cron 场景)不要再 append,
# 否则同一行会写两遍。手动跑(stdout 是终端/管道)时则把记录一并落盘。
# 注意:不能在 $( ) 里读 /proc/self/fd/1 —— 命令替换会把 fd 1 换成管道,
# 读到的永远是管道。得先 fdup 到 fd 3 再读 /proc/self/fd/3。
exec 3>&1
stdout_real="$(readlink -f /proc/self/fd/3 2>/dev/null || printf '')"
exec 3>&-
log_file_real="$(readlink -f "$LOG_FILE" 2>/dev/null || printf '%s' "$LOG_FILE")"
if [ -n "$stdout_real" ] && [ "$stdout_real" = "$log_file_real" ]; then
  stdout_is_log=1
else
  stdout_is_log=0
fi

mkdir -p "$LOG_DIR" 2>/dev/null || true

# 一行日志:stdout + 落盘(LOG_FILE),cron 场景下 stdout 已被重定向进 LOG_FILE,不重复写
emit() {
  local line
  line="$(date '+%F %T') $LOG_TAG $*"
  printf '%s\n' "$line"
  if [ "$stdout_is_log" -eq 0 ]; then
    printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true
  fi
  return 0
}

# 写 syslog(journalctl -t ssl-cert 可查)
syslog() {
  if command -v logger >/dev/null 2>&1; then
    logger -t "$SYSLOG_TAG" "$*" 2>/dev/null || true
  fi
  return 0
}

emit "开始证书到期巡检(SSL_DIR=$SSL_DIR, 阈值 ${WARN_DAYS} 天)"

shopt -s nullglob
cert_files=("$SSL_DIR"/live/*/fullchain.pem)
shopt -u nullglob

exit_code=0
checked=0
alert_msg=""

if [ "${#cert_files[@]}" -eq 0 ]; then
  # 一张证书都没有 = SSL 目录丢了或路径变了,本身就是异常(同样要告警)
  emit "ERROR: 没找到任何证书($SSL_DIR/live/*/fullchain.pem),SSL 目录可能丢失"
  syslog "cert expiry check ERROR: no certificate found under $SSL_DIR/live"
  alert_msg="no certificate found under $SSL_DIR/live"
  exit_code=1
else
  for f in "${cert_files[@]}"; do
    domain="$(basename "$(dirname "$f")")"
    checked=$((checked + 1))

    # 剩余天数(仅用于展示/告警文案;判定一律以 openssl -checkend 退出码为准)
    days="?"
    end_date="$(openssl x509 -noout -enddate -in "$f" 2>/dev/null | cut -d= -f2- || true)"
    if [ -n "$end_date" ]; then
      end_epoch="$(date -d "$end_date" +%s 2>/dev/null || printf '')"
      if [ -n "$end_epoch" ]; then
        days=$(( (end_epoch - $(date +%s)) / 86400 ))
      fi
    fi

    # -checkend N 返回 0 = 证书在 N 秒后仍有效(剩余 >= N);非 0 = 不足 N
    if ! openssl x509 -checkend 0 -noout -in "$f" >/dev/null 2>&1; then
      status="EXPIRED"
      exit_code=1
    elif ! openssl x509 -checkend "$WARN_SECONDS" -noout -in "$f" >/dev/null 2>&1; then
      status="WARN"
      exit_code=1
    else
      status="OK"
    fi

    if [ "$status" = "OK" ]; then
      emit "OK $domain 剩余 ${days} 天"
    else
      emit "$status $domain 剩余 ${days} 天(阈值 ${WARN_DAYS} 天),需要处理"
      syslog "cert $status: $domain 剩余 ${days} 天(阈值 ${WARN_DAYS} 天)"
      alert_msg="${alert_msg}${domain}=${status}(剩余${days}天) "
    fi
  done
fi

if [ "$exit_code" -eq 0 ]; then
  emit "巡检完成:${checked} 张证书全部正常"
  syslog "cert expiry check OK: ${checked} cert(s) all >= ${WARN_DAYS} days"
else
  emit "巡检完成:发现异常,需人工处理"
  syslog "cert expiry check FAILED: ${alert_msg}"
fi

# 飞书群机器人告警。payload 必须是飞书格式:
#   {"msg_type":"text","content":{"text":"..."}}
# ⚠️ 之前这里用的是企业微信/钉钉的 {"msg":"..."} 格式 —— 飞书会返回 400,
#    而外面包着 || true 会把失败静默吞掉,等于没告警。格式必须按飞书来。
if [ -n "$SSL_ALERT_WEBHOOK" ] && [ "$exit_code" -ne 0 ]; then
  alert_text="🚨 [SSL证书到期告警] $(hostname) @ $(date '+%F %T')
详情: ${alert_msg}"
  if command -v jq >/dev/null 2>&1; then
    payload="$(jq -nc --arg t "$alert_text" '{msg_type:"text",content:{text:$t}}')"
  else
    # jq 缺失时手工转义(只覆盖 JSON 必需的三个字符)
    esc="$(printf '%s' "$alert_text" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')"
    payload="{\"msg_type\":\"text\",\"content\":{\"text\":\"${esc}\"}}"
  fi
  if curl -sf -m 10 -X POST "$SSL_ALERT_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "$payload" >/dev/null; then
    # 不要把 webhook URL 写进日志 —— 那是 secret,日志会被人翻到
    emit "飞书告警已推送"
  else
    # 推送失败必须留痕,否则又变成「以为告警了其实没发」
    emit "ERROR: 飞书推送失败(检查 .env.ssl-alert 里的 webhook 是否可达)"
    syslog "cert expiry FEISHU push FAILED"
  fi
fi

exit "$exit_code"
