// ecosystem.scheduler.config.js - PM2定时任务配置
module.exports = {
  apps: [
    {
      name: "sales-aggregate",
      script: "./scripts/sales-aggregate/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/sales-aggregate-error.log",
      out_file: "./logs/sales-aggregate-out.log",
      log_file: "./logs/sales-aggregate-combined.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      time: true,
      // 保持进程运行，不因为脚本执行完成而退出
      wait_ready: false,
      kill_timeout: 5000,
    },
    {
      name: "order-product-aggregate",
      script: "./scripts/order-product-aggregate/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/order-product-aggregate-error.log",
      out_file: "./logs/order-product-aggregate-out.log",
      log_file: "./logs/order-product-aggregate-combined.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      time: true,
      // 保持进程运行，不因为脚本执行完成而退出
      wait_ready: false,
      kill_timeout: 5000,
    },
    // {
    //   name: "thunt-blanket-crawler",
    //   script: "./scripts/thunt-blanket-crawler/index.js",
    //   instances: 1,
    //   exec_mode: "fork",
    //   autorestart: false,
    //   watch: false,
    //   max_memory_restart: "500M",
    //   env: {
    //     NODE_ENV: "production",
    //   },
    //   error_file: "./logs/thunt-blanket-crawler-error.log",
    //   out_file: "./logs/thunt-blanket-crawler-out.log",
    //   log_file: "./logs/thunt-blanket-crawler-combined.log",
    //   log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    //   time: true,
    //   // 保持进程运行，不因为脚本执行完成而退出
    //   wait_ready: false,
    //   kill_timeout: 5000,
    //   cron_restart: "0 0 * * *", // 每天00:00执行
    // },
  ],
};
