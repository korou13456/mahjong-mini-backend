// 挂毯库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取挂毯库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-tapestry-inventory"));

// 新增挂毯库存记录
router.post("/add", backendAuth, require("./add-tapestry-record"));

// 修改挂毯库存记录
router.post("/update", backendAuth, require("./update-tapestry-record"));

module.exports = router;
