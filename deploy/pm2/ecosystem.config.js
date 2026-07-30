module.exports = {
  apps: [
    {
      name: 'erp-admin-backend',
      cwd: '/home/deploy/erp-admin-backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: '30s',
      out_file: '/data/logs/erp-admin/backend-out.log',
      error_file: '/data/logs/erp-admin/backend-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'ai-cs-demo',
      cwd: '/home/deploy/ai-cs-demo',
      script: 'node_modules/.bin/next',
      args: 'start -p 9529',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 9529,
      },
      max_memory_restart: '500M',
      out_file: '/data/logs/ai-cs-demo/out.log',
      error_file: '/data/logs/ai-cs-demo/err.log',
      merge_logs: true,
    },
  ],
};
