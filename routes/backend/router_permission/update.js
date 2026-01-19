// 更新路由权限
const db = require("../../../config/database");

async function updateRouterPermission(req, res) {
  try {
    const { id, parent_desc, router_name, router_desc, status, allow_users } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: "ID不能为空",
      });
    }

    // 检查路由是否存在
    const [existing] = await db.query(
      "SELECT id FROM router_permission WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        code: 404,
        message: "路由权限不存在",
      });
    }

    // 如果修改了router_name，检查是否与其他路由重复
    if (router_name) {
      const [duplicate] = await db.query(
        "SELECT id FROM router_permission WHERE router_name = ? AND id != ?",
        [router_name, id]
      );

      if (duplicate.length > 0) {
        return res.status(400).json({
          code: 400,
          message: "路由名称已存在",
        });
      }
    }

    const updateFields = [];
    const values = [];

    if (parent_desc !== undefined) {
      updateFields.push("parent_desc = ?");
      values.push(parent_desc || null);
    }
    if (router_name !== undefined) {
      updateFields.push("router_name = ?");
      values.push(router_name);
    }
    if (router_desc !== undefined) {
      updateFields.push("router_desc = ?");
      values.push(router_desc || null);
    }
    if (status !== undefined) {
      updateFields.push("status = ?");
      values.push(status);
    }
    if (allow_users !== undefined) {
      updateFields.push("allow_users = ?");
      values.push(JSON.stringify(allow_users));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        code: 400,
        message: "没有需要更新的字段",
      });
    }

    values.push(id);
    await db.query(
      `UPDATE router_permission SET ${updateFields.join(", ")} WHERE id = ?`,
      values
    );

    res.json({
      code: 200,
      message: "更新成功",
    });
  } catch (error) {
    console.error("更新路由权限失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = updateRouterPermission;
