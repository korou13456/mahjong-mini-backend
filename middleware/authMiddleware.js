// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

// 安全配置：生产环境必须设置JWT_SECRET
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!secret) {
    if (isProduction) {
      throw new Error('生产环境必须配置JWT_SECRET环境变量');
    }
    console.warn('⚠️  开发环境使用默认JWT密钥，生产环境请务必配置JWT_SECRET');
    return 'development_jwt_secret_change_in_production';
  }
  
  // 检查密钥强度
  if (secret.length < 32) {
    console.warn('⚠️  JWT密钥长度建议至少32位字符');
  }
  
  return secret;
};

const authMiddleware = (req, res, next) => {
  const token =
    req.headers.authorization?.replace("Bearer ", "") ||
    req.query?.token ||
    req.body?.token;

  if (!token) {
    return res.status(401).json({ 
      code: 401, 
      message: "未登录或Token缺失",
      success: false
    });
  }

  try {
    const JWT_SECRET = getJwtSecret();
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 把解码后的用户信息挂载到 req.user，后续接口可直接用
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT验证失败:', err.message);
    return res.status(401).json({ 
      code: 401, 
      message: "Token无效或已过期",
      success: false
    });
  }
};

module.exports = authMiddleware;
