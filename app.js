// app.js
const express = require("express");
const cors = require("cors");
const db = require("./config/database");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "后端服务运行正常!" });
});

// 注册活动相关路由
app.use("/api/mahjong", require("./routes/mahjong"));

app.listen(port, () => {
  console.log(`✅ 服务器运行在 http://localhost:${port}`);
});
