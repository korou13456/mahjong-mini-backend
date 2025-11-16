// routes/mahjong/index.js
const express = require("express");
const path = require("path");
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
const getTableDetail = require("./getTableDetail");
const getUserInfoByPhone = require("./getUserInfoByPhone");
const adminCreateRoom = require("./adminCreateRoom");
const createMenu = require("./createMenu");

const wechat = require("./wechat");

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
// 管理员创建房间
router.post("/admin-create-room", authMiddleware, adminCreateRoom);
// 获取用户当前状态
router.get("/get-user-room-status", authMiddleware, getUserRoomStatus);
// 获取用户信息
router.get("/get-user-information", authMiddleware, getUserInformation);
// 获取房间信息
router.get("/get-table-detail", getTableDetail);
// 根据手机号获取用户信息
router.get("/get-user-info-by-phone", getUserInfoByPhone);
// 登录接口
router.post("/login", login);
// 更新用户信息接口
router.post("/update-user-info", authMiddleware, updateUserInfo);
// 微信服务号消息接收（服务器配置/消息推送）
router.get("/wechat", wechat.wechatVerify);
router.post("/wechat", wechat.wechatReceive);
// 创建自定义菜单
router.get("/create-menu", createMenu);

// 用户协议 H5 页面
router.get("/agreement-user", (req, res) => {
  const htmlPath = path.join(__dirname, "agreement", "user.html");
  res.sendFile(htmlPath);
});
// 隐私协议 H5 页面
router.get("/agreement-privacy", (req, res) => {
  const htmlPath = path.join(__dirname, "agreement", "privacy.html");
  res.sendFile(htmlPath);
});

module.exports = router;
