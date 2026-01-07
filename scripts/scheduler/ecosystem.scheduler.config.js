// ecosystem.scheduler.config.js - PM2定时任务配置
module.exports = {
  apps: [
    {
      name: "scheduler",
      script: "./scripts/scheduler/scheduler.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./scripts/logs/scheduler-error.log",
      out_file: "./scripts/logs/scheduler-out.log",
      log_file: "./scripts/logs/scheduler-combined.log",
      time: true,
    },
  ],
};
