// 修改账号密码
const express = require('express');
const router = express.Router();
const { backendAuth } = require('../../middleware/backend-auth');
const db = require('../../config/database');

async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.userId;

    // 参数校验
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        code: 400,
        message: '原密码和新密码不能为空'
      });
    }

    // 查询当前用户
    const [users] = await db.query(
      'SELECT id, password FROM admin_user WHERE id = ? LIMIT 1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在'
      });
    }

    const user = users[0];

    // 验证原密码
    if (user.password !== oldPassword) {
      return res.status(401).json({
        code: 401,
        message: '原密码错误'
      });
    }

    // 更新密码
    await db.query(
      'UPDATE admin_user SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPassword, userId]
    );

    res.json({
      code: 200,
      message: '密码修改成功'
    });

  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误'
    });
  }
}

module.exports = changePassword;
