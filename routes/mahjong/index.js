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
const { 
  createRoomValidation,
  enterRoomValidation,
  exitRoomValidation,
  updateUserInfoValidation,
  pointsValidation 
} = require("../../middleware/basicValidation");
const getUserRoomStatus = require("./getUserRoomStatus");
const { wechatLogin, loginValidation } = require("./login");
const getUserInformation = require("./getUserInformation");
const updateUserInfo = require("./updateUserInfo");
const getTableDetail = require("./getTableDetail");
const getUserInfoByPhone = require("./getUserInfoByPhone");
const adminCreateRoom = require("./adminCreateRoom");
const createMenu = require("./createMenu");
const eventLog = require("./eventLog");
const {
  invitePoints,
  sharePoints,
  getPointHistory,
  getScoreSummary,
  getScoreRanking,
} = require("./invitePoints");

const wechat = require("./wechat");
const { getActivityStatus } = require("./activitySwitch");
const { recordInstall, installLogValidation } = require("./installLog");

// 获取麻将房间列表
router.get("/get-table-list", getTableList);
// 加入房间
router.post("/enter-room", authMiddleware, enterRoomValidation, enterRoom);
// 退出房间
router.post("/exit-room", authMiddleware, exitRoomValidation, exitRoom);
// 配置接口
router.get("/get-config-list", getConfigList);
// 获取商家列表
router.get("/get-store-list", getStoreList);
// 创建房间
router.post("/create-room", authMiddleware, createRoomValidation, createRoom);
// 管理员创建房间
router.post("/admin-create-room", authMiddleware, createRoomValidation, adminCreateRoom);
// 获取用户当前状态
router.get("/get-user-room-status", authMiddleware, getUserRoomStatus);
// 获取用户信息
router.get("/get-user-information", authMiddleware, getUserInformation);
// 获取房间信息
router.get("/get-table-detail", getTableDetail);
// 根据手机号获取用户信息
router.get("/get-user-info-by-phone", getUserInfoByPhone);
// 登录接口
router.post("/login", loginValidation, wechatLogin);
// 更新用户信息接口
router.post("/update-user-info", authMiddleware, updateUserInfoValidation, updateUserInfo);
// 微信服务号消息接收（服务器配置/消息推送）
router.get("/wechat", wechat.wechatVerify);
router.post("/wechat", wechat.wechatReceive);
// 创建自定义菜单
router.get("/create-menu", createMenu);
// 记录事件日志
router.post("/event-log", eventLog);
// 记录邀请积分
router.post("/invite-points", pointsValidation, invitePoints);
// 记录分享积分
router.post("/share-points", pointsValidation, sharePoints);
// 获取积分明细
router.get("/point-history", authMiddleware, getPointHistory);
// 获取积分汇总
router.get("/score-summary", authMiddleware, getScoreSummary);
// 获取积分榜
router.get("/score-ranking", getScoreRanking);
// 获取活动开关状态
router.get("/activity-status", getActivityStatus);
// 记录安装信息
router.post("/record-install", installLogValidation, recordInstall);

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
