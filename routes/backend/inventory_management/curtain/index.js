// 窗帘库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取窗帘库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-curtain-inventory"));

// 新增窗帘库存记录
router.post("/add", backendAuth, require("./add-curtain-record"));

// 批量新增窗帘库存记录
router.post("/batch-add", backendAuth, require("./batch-add-curtain-record"));

// 修改窗帘库存记录
router.post("/update", backendAuth, require("./update-curtain-record"));

module.exports = router;
