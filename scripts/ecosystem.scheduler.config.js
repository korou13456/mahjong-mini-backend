// ecosystem.scheduler.config.js - PM2定时任务配置
module.exports = {
  apps: [
    {
      name: 'scheduler',
      script: './scheduler.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/scheduler-error.log',
      out_file: './logs/scheduler-out.log',
      log_file: './logs/scheduler-combined.log',
      time: true
    }
  ]
};