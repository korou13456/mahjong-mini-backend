const { verifyToken } = require('../utils/token');

/**
 * 后台管理权限验证中间件
 */
function backendAuth(req, res, next) {
  // 获取 token
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 401,
      message: '未提供认证令牌'
    });
  }

  const token = authHeader.substring(7); // 去掉 'Bearer ' 前缀

  // 验证 token
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      code: 401,
      message: '认证令牌无效或已过期'
    });
  }

  // 将用户信息挂载到 req 对象上
  req.user = decoded;
  next();
}

/**
 * 角色权限验证中间件
 * @param {Array<String>} allowedRoles - 允许的角色列表
 */
function roleAuth(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        code: 401,
        message: '未认证'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        code: 403,
        message: '权限不足'
      });
    }

    next();
  };
}

module.exports = {
  backendAuth,
  roleAuth
};
