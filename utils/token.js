const jwt = require('jsonwebtoken');

// JWT 密钥（生产环境应从环境变量读取）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; // token 有效期 7 天

/**
 * 生成 token
 * @param {Object} payload - 要加密的数据
 * @returns {String} token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证 token
 * @param {String} token - JWT token
 * @returns {Object|null} 解析后的数据，验证失败返回 null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};
