// 删除路由权限
const db = require("../../../config/database");

async function deleteRouterPermission(req, res) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: "ID不能为空",
      });
    }

    const [result] = await db.query(
      "DELETE FROM router_permission WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        code: 404,
        message: "路由权限不存在",
      });
    }

    res.json({
      code: 200,
      message: "删除成功",
    });
  } catch (error) {
    console.error("删除路由权限失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = deleteRouterPermission;
