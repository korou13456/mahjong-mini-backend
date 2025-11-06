// routes/upload/index.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const filename = `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}${ext}`;
    cb(null, filename);
  },
});

// 修改 multer 配置，禁用文件大小限制和数量限制
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 限制为 10MB，可以根据需要调整
    files: 1, // 限制为 1 个文件
  },
  // 禁用文件过滤器，允许所有文件类型
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "没有上传文件" });

  const isProd = process.env.NODE_ENV === "production";
  const host = isProd ? process.env.PUBLIC_HOST || "你的生产域名" : "localhost";
  const port = process.env.PORT || 3000;

  const fileUrl = `http://${host}:${port}/uploads/${req.file.filename}`;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json({
    message: "上传成功",
    url: fileUrl,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

module.exports = router;
