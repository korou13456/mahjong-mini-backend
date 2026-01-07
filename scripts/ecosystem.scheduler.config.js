// ecosystem.scheduler.config.js - PM2定时任务配置
module.exports = {
  apps: [
    {
      name: "sales-aggregate",
      script: "./scripts/sales-aggregate/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/sales-aggregate-error.log",
      out_file: "./logs/sales-aggregate-out.log",
      log_file: "./logs/sales-aggregate-combined.log",
      time: true,
    },
  ],
};
