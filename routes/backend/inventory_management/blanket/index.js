// 毛毯库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取毛毯库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-blanket-inventory"));

// 新增毛毯库存记录
router.post("/add", backendAuth, require("./add-blanket-record"));

// 批量新增毛毯库存记录
router.post("/batch-add", backendAuth, require("./batch-add-blanket-record"));

// 修改毛毯库存记录
router.post("/update", backendAuth, require("./update-blanket-record"));

module.exports = router;
