// 地垫库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取地垫库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-doormat-inventory"));

// 新增地垫库存记录
router.post("/add", backendAuth, require("./add-doormat-record"));

// 批量新增地垫库存记录
router.post("/batch-add", backendAuth, require("./batch-add-doormat-record"));

// 修改地垫库存记录
router.post("/update", backendAuth, require("./update-doormat-record"));

module.exports = router;
