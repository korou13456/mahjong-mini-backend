// utils/tokenHelpers.js
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * 从请求中提取用户ID（可选验证）
 * @param {Object} req - Express请求对象
 * @returns {number|null} - 用户ID，如果token无效则返回null
 */
function extractUserIdFromToken(req) {
  let userId = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
    } catch (error) {
      console.warn("Token无效或已过期:", error.message);
    }
  }

  return userId;
}

/**
 * 从请求中强制提取用户ID（必须有有效token）
 * @param {Object} req - Express请求对象
 * @returns {number} - 用户ID
 * @throws {Error} - 如果token无效或不存在
 */
function requireUserIdFromToken(req) {
  const userId = extractUserIdFromToken(req);

  if (!userId) {
    throw new Error("需要有效的用户token");
  }

  return userId;
}

module.exports = {
  extractUserIdFromToken,
  requireUserIdFromToken,
};
