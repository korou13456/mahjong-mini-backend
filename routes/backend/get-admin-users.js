// 获取管理员用户列表
const db = require("../../config/database");

async function getAdminUsers(req, res) {
  try {
    const { username } = req.query;

    let sql = "SELECT id, username, phone, department, role, status, created_at, updated_at FROM admin_user WHERE 1=1";
    const params = [];

    if (username) {
      sql += " AND username LIKE ?";
      params.push(`%${username}%`);
    }

    sql += " ORDER BY id DESC";

    const [list] = await db.query(sql, params);

    res.json({
      code: 200,
      message: "查询成功",
      data: list,
    });
  } catch (error) {
    console.error("获取管理员用户列表失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getAdminUsers;
