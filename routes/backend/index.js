// 后台管理路由统一入口
const express = require('express');
const router = express.Router();
const { backendAuth } = require('../../middleware/backend-auth');

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
