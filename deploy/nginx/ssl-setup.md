# SSL 证书申请

## 前置

- 域名 erp.yourdomain.com + cs.yourdomain.com 已解析到服务器公网 IP
- 备案完成(中国大陆服务器必须)
- Nginx 已装

## 申请

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d erp.yourdomain.com \
  -d cs.yourdomain.com \
  --email your-email@example.com \
  --agree-tos --no-eff-email --redirect
```

## 自动续签

certbot 自动加 crontab,验证:

```bash
sudo certbot renew --dry-run
```

证书路径: `/etc/letsencrypt/live/<domain>/`

## 验证

```bash
curl -I https://erp.yourdomain.com
# 期望:200 OK,HSTS header

# SSL 评分
# 访问 https://www.ssllabs.com/ssltest/analyze.html?d=erp.yourdomain.com
# 期望:A 或 A+
```
