// 验证 token 是否有效
const express = require('express');
const router = express.Router();
const { backendAuth } = require('../../middleware/backend-auth');

async function verifyToken(req, res) {
  try {
    // 如果能走到这里，说明 token 已经过 backendAuth 验证有效
    res.json({
      code: 200,
      message: 'token 有效',
      data: {
        userId: req.user.userId,
        username: req.user.username,
        role: req.user.role,
        department: req.user.department
      }
    });
  } catch (error) {
    console.error('验证 token 失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误'
    });
  }
}

module.exports = verifyToken;
