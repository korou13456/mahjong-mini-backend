const jwt = require("jsonwebtoken");
const JWT_SECRET =
  "bd57f641483e885e3bdf7f6a3e538e58b2b1eaaafeb70f6dfea4ef30b5921597360c42ffad4b91cf1a8a7a194f04321da97f3ab863af3d90e55494961d107418"; // 跟登录保持一致

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
