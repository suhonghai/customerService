#!/bin/bash
# 一键启动所有 PM2 服务
set -e

cd /home/deploy
pm2 start /home/deploy/deploy/pm2/ecosystem.config.js
pm2 save

echo "=== 启动状态 ==="
pm2 status
echo ""
echo "=== 验证 ==="
sleep 5
curl -s http://127.0.0.1:3001/api/health | jq .
curl -s -o /dev/null -w "ai-cs-demo: %{http_code}\n" http://127.0.0.1:9529
