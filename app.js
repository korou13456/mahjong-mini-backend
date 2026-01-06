// app.js
const path = require("path");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const {
  buildSignature,
  buildMsgSignature,
  aesDecrypt,
} = require("./utils/wechatVerify");
// 统一错误处理中间件
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

require("dotenv").config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env"
  ),
});

const app = express();
const port = Number(process.env.PORT || 3000);

// 跨域和json解析
app.use(cors());
// capture raw body for signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// 确保 uploads 目录存在
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 静态资源托管
app.use("/uploads", express.static(uploadDir));

// 挂载上传路由
app.use("/api/upload", require("./routes/upload"));

// 挂载商业相关路由
app.use("/api/commerce", require("./routes/commerce"));

// 挂载后台管理路由
app.use("/api/backend", require("./routes/backend"));

// 挂载麻将相关路由
// 启用微信 API 安全校验（仅生产环境有效，且当请求头存在时生效）
app.use(require("./middleware/wechatApiSecurity")());
app.use("/api/mahjong", require("./routes/mahjong"));

// 根路由测试
app.get("/", (req, res) => {
  const host = process.env.PUBLIC_HOST;
  res.json({ message: "后端服务运行正常!", host, port });
});

// 微信小程序 业务域名验证文件
app.get("/lJNSP0vVfy.txt", (req, res) => {
  const verifyPath = path.join(__dirname, "routes", "lJNSP0vVfy.txt");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.sendFile(verifyPath);
});

app.get("/test", (req, res) => {
  res.json({ message: "上传成功" });
});

// 404处理
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

// 启动服务
app.listen(port, () => {
  const host = process.env.PUBLIC_HOST;
  console.log(`✅ 服务器运行在 http://${host}:${port}`);
});
