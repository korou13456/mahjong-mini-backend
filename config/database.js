const mysql = require("mysql2");

// 归一化 host，避免 macOS 上 localhost 解析为 ::1 导致连接被拒绝
const configuredHost = process.env.DB_HOST || "127.0.0.1";
const normalizedHost =
  configuredHost === "localhost" ? "127.0.0.1" : configuredHost;

// 创建连接池（通过环境变量配置）
const pool = mysql.createPool({
  host: normalizedHost,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "myapp",
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT || 0),
  charset: "utf8mb4",
});

const nodeEnv = process.env.NODE_ENV || "development";
console.log(
  `✅ MySQL 连接池创建成功 (环境: ${nodeEnv}, 数据库: ${normalizedHost}:${
    process.env.DB_PORT || 3306
  })`
);

// 捕获连接错误（防止 scheduler 崩溃）
pool.on("error", (err) => {
  console.error("❌ MySQL 连接池错误:", err);
});

module.exports = pool.promise(); // 导出 promise
