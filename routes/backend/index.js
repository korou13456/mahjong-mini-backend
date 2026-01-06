// 后台管理路由统一入口
const express = require('express');
const router = express.Router();
const { backendAuth } = require('../../middleware/backend-auth');

// 根路由
router.get('/', (req, res) => {
  res.json({
    code: 200,
    message: '后台管理 API',
    data: {
      description: '后台管理系统接口',
      version: '1.0.0',
      endpoints: {
        login: {
          method: 'POST',
          path: '/api/backend/login',
          description: '管理员登录接口'
        },
        verifyToken: {
          method: 'GET',
          path: '/api/backend/verify-token',
          description: '验证 token 是否有效',
          auth: true
        },
        changePassword: {
          method: 'POST',
          path: '/api/backend/change-password',
          description: '修改账号密码',
          auth: true
        },
        batchImportSales: {
          method: 'POST',
          path: '/api/backend/batch-import-sales',
          description: '批量导入销售报表数据',
          auth: true
        }
      }
    }
  });
});

// 登录接口
router.post('/login', require('./login'));
// 验证 token 有效
router.get('/verify-token', backendAuth, require('./verify-token'));
// 修改密码
router.post('/change-password', backendAuth, require('./change-password'));
// 批量导入销售报表
router.post('/batch-import-sales', backendAuth, require('./batch-import-sales'));

// 其他后台接口可以继续添加
// router.get('/users', backendAuth, require('./users'));
// router.post('/users', backendAuth, require('./users/create'));
// router.delete('/users/:id', backendAuth, roleAuth(['admin']), require('./users/delete'));

module.exports = router;
