// 获取路由权限列表
const db = require("../../../config/database");

async function getRouterPermissions(req, res) {
  try {
    const { status, router_name, router_desc, page = 1, pageSize = 10 } = req.query;

    let sql = "SELECT * FROM router_permission WHERE 1=1";
    const params = [];

    if (status !== undefined) {
      sql += " AND status = ?";
      params.push(parseInt(status));
    }

    if (router_name) {
      sql += " AND router_name LIKE ?";
      params.push(`%${router_name}%`);
    }

    if (router_desc) {
      sql += " AND router_desc LIKE ?";
      params.push(`%${router_desc}%`);
    }

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(parseInt(pageSize), offset);

    const [list] = await db.query(sql, params);

    // 获取总数
    const countSql = sql.split("ORDER BY")[0].replace(/SELECT.*FROM/, "SELECT COUNT(*) as total FROM");
    const [countResult] = await db.query(countSql, params.slice(0, params.length - 2));

    // 查询 allow_users 对应的用户名称
    for (const item of list) {
      if (item.status == 1 && item.allow_users) {
        let userIds;
        // 判断是否为 JSON 字符串
        if (typeof item.allow_users === 'string') {
          try {
            userIds = JSON.parse(item.allow_users);
          } catch (e) {
            item.allow_users_info = [];
            continue;
          }
        } else if (Array.isArray(item.allow_users)) {
          userIds = item.allow_users;
        } else {
          item.allow_users_info = [];
          continue;
        }

        if (Array.isArray(userIds) && userIds.length > 0) {
          const [users] = await db.query(
            `SELECT id, username FROM admin_user WHERE id IN (?) AND status = 1`,
            [userIds]
          );
          item.allow_users_info = users;
        } else {
          item.allow_users_info = [];
        }
      } else {
        item.allow_users_info = [];
      }
    }

    res.json({
      code: 200,
      message: "查询成功",
      data: {
        list,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    });
  } catch (error) {
    console.error("获取路由权限列表失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getRouterPermissions;
