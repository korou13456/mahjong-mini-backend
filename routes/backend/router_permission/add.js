// 新增路由权限
const db = require("../../../config/database");

async function addRouterPermission(req, res) {
  try {
    const { parent_desc, router_name, router_desc, status = 0, allow_users = [] } = req.body;

    if (!router_name) {
      return res.status(400).json({
        code: 400,
        message: "路由名称不能为空",
      });
    }

    // 检查路由名称是否已存在
    const [existing] = await db.query(
      "SELECT id FROM router_permission WHERE router_name = ?",
      [router_name]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        code: 400,
        message: "路由名称已存在",
      });
    }

    await db.query(
      `INSERT INTO router_permission (parent_desc, router_name, router_desc, status, allow_users)
       VALUES (?, ?, ?, ?, ?)`,
      [parent_desc || null, router_name, router_desc || null, status, JSON.stringify(allow_users)]
    );

    res.json({
      code: 200,
      message: "添加成功",
    });
  } catch (error) {
    console.error("新增路由权限失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = addRouterPermission;
