#!/bin/bash
# /etc/logrotate.d/erp-admin
cat > /tmp/erp-admin-logrotate <<'EOF'
/data/logs/erp-admin/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 deploy deploy
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}

/data/logs/ai-cs-demo/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 deploy deploy
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

sudo mv /tmp/erp-admin-logrotate /etc/logrotate.d/erp-admin
sudo logrotate -f /etc/logrotate.d/erp-admin
echo "Logrotate config installed"
