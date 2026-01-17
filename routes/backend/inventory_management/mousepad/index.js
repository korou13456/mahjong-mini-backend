// 鼠标垫库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取鼠标垫库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-mousepad-inventory"));

// 新增鼠标垫库存记录
router.post("/add", backendAuth, require("./add-mousepad-record"));

// 批量新增鼠标垫库存记录
router.post("/batch-add", backendAuth, require("./batch-add-mousepad-record"));

// 修改鼠标垫库存记录
router.post("/update", backendAuth, require("./update-mousepad-record"));

module.exports = router;
