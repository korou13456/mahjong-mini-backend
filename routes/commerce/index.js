const express = require("express");
const router = express.Router();
const prohibitedScreening = require("./prohibited");

// 敏感词筛查接口
router.post("/prohibited-screening", prohibitedScreening);

module.exports = router;