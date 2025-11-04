// app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./config/database");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "后端服务运行正常!111" });
});

// 注册活动相关路由
app.use("/api/mahjong", require("./routes/mahjong"));

// 404 处理
app.use((req, res, next) => {
  res.status(404).json({ code: 404, message: "资源未找到" });
});

// 全局错误处理中间件
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res
    .status(500)
    .json({ code: 500, message: "服务器错误", error: err.message });
});

app.listen(port, () => {
  console.log(`✅ 服务器运行在 http://localhost:${port}`);
});
