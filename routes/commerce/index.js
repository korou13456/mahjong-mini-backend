const express = require("express");
const router = express.Router();
const prohibitedScreening = require("./prohibited.js");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

// 敏感词筛查接口
router.post("/prohibited-screening", prohibitedScreening);

// 获取模板文件
router.get("/template", (req, res) => {
  try {
    const templatePath = path.join(__dirname, "活动上报模板.xlsx");
    const fileBuffer = fs.readFileSync(templatePath);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=template.xlsx");
    res.send(fileBuffer);
  } catch (error) {
    res.status(500).json({ error: "模板文件不存在" });
  }
});

// Excel 表格解析工具页面
router.get("/table-processor", (req, res) => {
  res.sendFile(path.join(__dirname, "table-processor.html"));
});

module.exports = router;
