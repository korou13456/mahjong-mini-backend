// config/database.js
const mysql = require("mysql2");
require("dotenv").config();

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  // 添加这些配置
  insecureAuth: true,
  socketPath: null, // 强制使用 TCP 连接
});

connection.connect((err) => {
  if (err) {
    console.error("数据库连接失败: ", err);
    console.log("请检查 MySQL 服务是否运行: brew services start mysql");
    return;
  }
  console.log("成功连接到 MySQL 数据库");
});

module.exports = connection;
