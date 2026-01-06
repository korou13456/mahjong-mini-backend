// 统一登录接口（所有用户在一个表中通过 role 区分）
const express = require("express");
const router = express.Router();
const db = require("../../config/database");
const { generateToken } = require("../../utils/token");

// 登录接口
async function login(req, res) {
  try {
    const { username, password } = req.body;

    // 参数校验
    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: "用户名和密码不能为空",
      });
    }

    // 查询用户
    const sql = `
      SELECT id, username, phone, password, department, role, status
      FROM admin_user
      WHERE username = ? OR phone = ?
      LIMIT 1
    `;

    const [users] = await db.query(sql, [username, username]);

    if (users.length === 0) {
      return res.status(401).json({
        code: 401,
        message: "用户不存在",
      });
    }

    const user = users[0];

    // 检查账号状态
    if (user.status !== 1) {
      return res.status(403).json({
        code: 403,
        message: "账号已被禁用",
      });
    }

    // 验证密码（目前明文对比）
    if (user.password !== password) {
      return res.status(401).json({
        code: 401,
        message: "密码错误",
      });
    }

    // 生成 token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      department: user.department,
    });

    // 登录成功，返回用户信息和 token
    res.json({
      code: 200,
      message: "登录成功",
      data: {
        token,
        userInfo: {
          id: user.id,
          username: user.username,
          phone: user.phone,
          department: user.department,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("登录失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = login;
