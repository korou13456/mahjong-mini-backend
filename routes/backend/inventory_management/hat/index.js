// 帽子库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取帽子库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-hat-inventory"));

// 新增帽子库存记录
router.post("/add", backendAuth, require("./add-hat-record"));

// 修改帽子库存记录
router.post("/update", backendAuth, require("./update-hat-record"));

module.exports = router;
