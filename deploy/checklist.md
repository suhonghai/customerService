# W11 上线 Checklist

## 部署前

### 服务器
- [ ] 腾讯云 CVM 2C4G+ 已购(操作系统 Ubuntu 22 或 CentOS 7)
- [ ] 公网 IP 已知
- [ ] 备案完成(中国大陆必须)
- [ ] 域名 erp.yourdomain.com + cs.yourdomain.com 解析到公网 IP

### 本地
- [ ] SSH key 生成: `ssh-keygen -t ed25519 -f ~/.ssh/erp_admin`
- [ ] 公钥已加到服务器: `ssh-copy-id -i ~/.ssh/erp_admin.pub deploy@your-server-ip`
- [ ] 本地 build 通过: `bash deploy/scripts/build-all.sh`

## 部署中

- [ ] 服务器初始化: 创建 deploy 用户 / 装 Node 20 / PM2 / Nginx / Docker
- [ ] MySQL 5.7 装好 + erp 库创建 + 应用用户授权
- [ ] Chroma Docker 容器跑起来
- [ ] 代码上传到服务器
- [ ] .env 配好(密钥、DATABASE_URL、域名)
- [ ] `pnpm prisma migrate deploy` 成功
- [ ] `pnpm prisma db seed` 创建初始数据
- [ ] PM2 启动 backend + ai-cs-demo
- [ ] Nginx 配置 deploy/nginx/*.conf
- [ ] certbot 申请 SSL
- [ ] `/api/health` 返 200

## 部署后

- [ ] 浏览器打开 https://erp.yourdomain.com/login
- [ ] admin / Admin@123 登录成功
- [ ] 测几个核心功能:
  - [ ] 用户管理 CRUD
  - [ ] 角色管理 + 分配菜单
  - [ ] AI 配置(测试连接 dashscope)
  - [ ] FAQ 上传 + 审核发布
  - [ ] 订单列表 + 改状态
  - [ ] 工单分配
- [ ] 浏览器打开 https://cs.yourdomain.com
- [ ] ai-cs-demo 对话测试,触发 RAG + MCP 工具

## 监控

- [ ] 健康检查 cron: `*/5 * * * * /home/deploy/deploy/scripts/health-check.sh`
- [ ] MySQL 备份 cron: `0 3 * * * /home/deploy/deploy/scripts/backup-mysql.sh`
- [ ] 文件备份 cron: `0 4 * * * /home/deploy/deploy/scripts/backup-files.sh`
- [ ] SSL 过期检查: `0 8 * * * /home/deploy/deploy/scripts/ssl-renew-watchdog.sh`
- [ ] 日志轮转: `bash deploy/scripts/logrotate.sh`
- [ ] 报警: 企业微信 webhook 配好(WECHAT_WEBHOOK)

## 安全

- [ ] 服务器 SSH key only(禁密码登录)
- [ ] 防火墙:22 / 80 / 443 开放,其他全关
- [ ] 腾讯云安全组同步
- [ ] fail2ban 装好
- [ ] JWT_SECRET / JWT_REFRESH_SECRET / AI_API_KEY_ENCRYPT_KEY / INTERNAL_TOKEN 全部 ≥ 64 hex chars
- [ ] .env 文件权限 600
- [ ] backend / mysql / chroma 端口只监听 127.0.0.1

## 性能

- [ ] PM2 cluster 模式(流量大时): `pm2 start ecosystem.config.js -i max`
- [ ] MySQL slow_query_log 开启
- [ ] Nginx gzip 启用
- [ ] antd-vendor chunk 1MB 用 lazy loading(已加)

## 验收

- [ ] ssllabs.com 评分 A 或 A+
- [ ] 性能基线: API P95 < 200ms
- [ ] E2E 全流程跑通(从用户登录 → FAQ 上传 → 工单分配 → 审计查看)
- [ ] 监控 + 报警 + 备份 全部就绪
- [ ] 文档移交(运维手册给运维人员)
