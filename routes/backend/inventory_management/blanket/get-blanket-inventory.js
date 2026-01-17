// 获取毛毯库存数据（总量表 + 记录表）
const db = require("../../../../config/database");

async function getBlanketInventory(req, res) {
  try {
    const { start_date, end_date, status, page = 1, limit = 20 } = req.query;

    const today = new Date();
    const endDate = end_date ? new Date(end_date) : new Date(today);
    const startDate = start_date ? new Date(start_date) : new Date(today);

    if (!start_date) startDate.setDate(startDate.getDate() - 30);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    // 查询总量
    const [inventory] = await db.query(
      `SELECT id, size_40_30, size_50_40, size_60_50, size_60_70, size_80_60, updated_at
       FROM blanket_inventory
       LIMIT 1`
    );

    // 构建查询条件
    const conditions = ["record_date >= ? AND record_date <= ?"];
    const params = [startDateStr, endDateStr];

    if (status !== undefined && status !== null && status !== "") {
      conditions.push("status = ?");
      params.push(status);
    }

    const whereClause = conditions.join(" AND ");

    // 查询总数
    const [totalResult] = await db.query(
      `SELECT COUNT(*) as total FROM blanket_inventory_record WHERE ${whereClause}`,
      params
    );

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limitNum);

    // 查询记录（分页）
    const [records] = await db.query(
      `SELECT id, record_date, status, size_40_30, size_50_40, size_60_50, size_60_70, size_80_60, remark, image_urls, created_at, updated_at
       FROM blanket_inventory_record
       WHERE ${whereClause}
       ORDER BY record_date DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    res.json({
      code: 200,
      message: "查询成功",
      data: {
        inventory: inventory[0] || {
          id: null,
          size_40_30: 0,
          size_50_40: 0,
          size_60_50: 0,
          size_60_70: 0,
          size_80_60: 0,
          updated_at: null,
        },
        records: records.map((record) => ({
          ...record,
          image_urls: record.image_urls ? (typeof record.image_urls === "string" ? JSON.parse(record.image_urls) : record.image_urls) : [],
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error("获取毛毯库存数据失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getBlanketInventory;
