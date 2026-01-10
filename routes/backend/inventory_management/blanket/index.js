// 毛毯库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取毛毯库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-blanket-inventory"));

module.exports = router;
