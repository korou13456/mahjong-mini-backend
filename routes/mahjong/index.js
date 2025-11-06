// routes/mahjong/index.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middleware/authMiddleware");

const getTableList = require("./getTableList");
const enterRoom = require("./enterRoom");
const exitRoom = require("./exitRoom");
const getConfigList = require("./getConfigList");
const getStoreList = require("./getStoreList");
const createRoom = require("./createRoom");
const getUserRoomStatus = require("./getUserRoomStatus");
const login = require("./login");
const getUserInformation = require("./getUserInformation");
const updateUserInfo = require("./updateUserInfo");

// 获取麻将房间列表
router.get("/get-table-list", getTableList);
// 加入房间
router.post("/enter-room", authMiddleware, enterRoom);
// 退出房间
router.post("/exit-room", authMiddleware, exitRoom);
// 配置接口
router.get("/get-config-list", getConfigList);
// 获取商家列表
router.get("/get-store-list", getStoreList);
// 创建房间
router.post("/create-room", authMiddleware, createRoom);
// 获取用户当前状态
router.get("/get-user-room-status", authMiddleware, getUserRoomStatus);
// 获取用户信息
router.get("/get-user-information", authMiddleware, getUserInformation);
// 登录接口
router.post("/login", login);
// 更新用户信息接口
router.post("/update-user-info", authMiddleware, updateUserInfo);

module.exports = router;
