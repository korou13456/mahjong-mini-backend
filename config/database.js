const mysql = require("mysql2");

// 创建连接池
const pool = mysql.createPool({
  host: "127.0.0.1",
  user: "root",
  password: "791204",
  database: "myapp",
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

console.log("✅ MySQL 连接池创建成功");

module.exports = pool.promise(); // 导出 promise
