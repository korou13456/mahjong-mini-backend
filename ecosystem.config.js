module.exports = {
  apps: [
    {
      name: "my-backend",
      script: "./app.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      // 日志配置
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // 自动重启配置
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      // 进程管理
      min_uptime: "10s",
      max_restarts: 10,
      // 优雅关闭
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};

