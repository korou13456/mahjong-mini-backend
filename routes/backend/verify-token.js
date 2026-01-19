// 验证 token 是否有效
const express = require('express');
const router = express.Router();
const { backendAuth } = require('../../middleware/backend-auth');
const db = require('../../config/database');

async function verifyToken(req, res) {
  try {
    const { path } = req.query;
    const userId = req.user.userId;

    // 如果能走到这里，说明 token 已经过 backendAuth 验证有效
    const result = {
      code: 200,
      message: 'token 有效',
      data: {
        userId: req.user.userId,
        username: req.user.username,
        role: req.user.role,
        department: req.user.department,
        phone: req.user.phone
      }
    };

    // 如果传入了路由路径，进行权限验证
    if (path) {
      const [routerPermission] = await db.query(
        'SELECT status, allow_users FROM router_permission WHERE router_name = ?',
        [path]
      );

      if (routerPermission.length > 0) {
        const permission = routerPermission[0];
        
        if (permission.status === 0) {
          // 全部可访问
          result.data.access = true;
          result.data.accessMessage = '可访问';
        } else {
          // status = 1，仅部分人可访问
          let allowUsers;
          if (typeof permission.allow_users === 'string') {
            try {
              allowUsers = JSON.parse(permission.allow_users);
            } catch (e) {
              allowUsers = [];
            }
          } else if (Array.isArray(permission.allow_users)) {
            allowUsers = permission.allow_users;
          } else {
            allowUsers = [];
          }

          if (allowUsers.includes(userId)) {
            result.data.access = true;
            result.data.accessMessage = '可访问';
          } else {
            result.data.access = false;
            result.data.accessMessage = '不可访问';
          }
        }
      } else {
        // 未配置路由权限，默认可访问
        result.data.access = true;
        result.data.accessMessage = '可访问（未配置权限）';
      }
    }

    res.json(result);
  } catch (error) {
    console.error('验证 token 失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误'
    });
  }
}

module.exports = verifyToken;
