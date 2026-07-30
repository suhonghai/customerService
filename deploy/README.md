# W11 ERP 部署目录

完整部署脚本 + Nginx 配置 + PM2 配置 + 备份 / 监控 / 报警。

## 端口规划(避开 8080 / 3000)

| 服务 | 端口 | 部署方式 |
|---|---|---|
| erp-admin-backend | 3001 | PM2(NestJS) |
| erp-admin-frontend | 5173(dev) / 80+443(prod) | Nginx 静态 + 反代 |
| ai-cs-demo | 9529 | PM2(Next.js) |
| chroma-cs | 8001 | Docker |
| mysql | 3306 | 本机 |
| nginx | 80/443 | system |

## 快速开始

详见 [checklist.md](checklist.md)。

## 关键命令

```bash
# 一键构建(本地)
bash scripts/build-all.sh

# 一键部署(推到服务器并部署)
DEPLOY_HOST=ubuntu@your-server-ip bash scripts/deploy.sh

# 一键启动所有服务
bash pm2/start-all.sh

# 健康检查
bash scripts/health-check.sh

# MySQL 备份
bash scripts/backup-mysql.sh

# MySQL 恢复
bash scripts/restore-mysql.sh /data/backup/mysql/erp_xxx.sql.gz
```

## 目录

- `nginx/`:Nginx 配置文件
- `pm2/`:PM2 配置 + 启动停止脚本
- `scripts/`:部署 / 备份 / 监控 / 报警脚本
- `checklist.md`:上线 checklist
- `CHANGELOG.md`:部署变更日志
