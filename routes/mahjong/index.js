const express = require("express");
const router = express.Router();
const getTableList = require("./getTableList");
const enterRoom = require("./enterRoom");
const exitRoom = require("./exitRoom");
const getConfigList = require("./getConfigList");
const getStoreList = require("./getStoreList");
const createRoom = require("./createRoom");
const aa = require("./aa");

// 获取麻将房间列表
router.get("/get-table-list", getTableList);
// 加入房间
router.post("/enter-room", enterRoom);
// 退出房间
router.post("/exit-room", exitRoom);
// 配置接口
router.get("/get-config-list", getConfigList);
// 获取商家列表
router.get("/get-store-list", getStoreList);
// 创建房间
router.post("/create-room", createRoom);

// 测试
router.post("/aa", aa);

module.exports = router;
