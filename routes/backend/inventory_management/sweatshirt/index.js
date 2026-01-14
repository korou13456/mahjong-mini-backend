// 卫衣库存管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../../middleware/backend-auth");

// 获取卫衣库存数据（总量表 + 记录表）
router.get("/get", backendAuth, require("./get-sweatshirt-inventory"));

// 新增卫衣库存记录
router.post("/add", backendAuth, require("./add-sweatshirt-record"));

// 修改卫衣库存记录
router.post("/update", backendAuth, require("./update-sweatshirt-record"));

module.exports = router;
