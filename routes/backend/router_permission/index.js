// 前端路由管理接口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../../middleware/backend-auth");

// 获取路由权限列表
router.get("/get", backendAuth, require("./get"));
// 新增路由权限
router.post("/add", backendAuth, require("./add"));
// 更新路由权限
router.post("/update", backendAuth, require("./update"));
// 删除路由权限
router.post("/delete", backendAuth, require("./delete"));

module.exports = router;

