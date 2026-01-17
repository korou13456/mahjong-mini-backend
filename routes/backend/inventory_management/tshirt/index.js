// T恤库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取T恤库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-tshirt-inventory"));

// 新增T恤库存记录
router.post("/add", backendAuth, require("./add-tshirt-record"));

// 批量新增T恤库存记录
router.post("/batch-add", backendAuth, require("./batch-add-tshirt-record"));

// 修改T恤库存记录
router.post("/update", backendAuth, require("./update-tshirt-record"));

module.exports = router;
