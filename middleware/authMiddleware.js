// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "change_me_in_env"; // 跟登录保持一致

const authMiddleware = (req, res, next) => {
  const token =
    req.headers.authorization?.replace("Bearer ", "") ||
    req.query.token ||
    req.body.token;

  if (!token) {
    return res.status(401).json({ code: 401, message: "未登录或Token缺失" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // 把解码后的用户信息挂载到 req.user，后续接口可直接用
    console.log(decoded);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: "Token无效或已过期" });
  }
};

module.exports = authMiddleware;
