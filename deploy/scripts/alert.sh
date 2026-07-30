#!/bin/bash
# 报警:邮件 + 企业微信

MSG="$1"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
FULL_MSG="[W11-ERP $TIMESTAMP] $MSG"

# 邮件
mail -s "W11 ERP Alert" your-email@example.com <<< "$FULL_MSG" 2>/dev/null

# 企业微信群机器人(替换 YOUR_KEY)
WECHAT_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
curl -s -X POST "$WECHAT_WEBHOOK" \
  -H 'Content-Type: application/json' \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"$FULL_MSG\"}}" > /dev/null

echo "[$TIMESTAMP] ALERT: $MSG" >> /data/logs/alert.log
