// 获取帽子库存数据（总量表 + 记录表）
const db = require("../../../../config/database");

async function getHatInventory(req, res) {
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
      `SELECT id, washed_black_denim, washed_sand_denim, red_sandwich_cap, updated_at
       FROM hat_inventory
       LIMIT 1`
    );

    // 查询在路上数据（status=0）的聚合
    const [transitResult] = await db.query(
      `SELECT
        COALESCE(SUM(washed_black_denim), 0) as washed_black_denim,
        COALESCE(SUM(washed_sand_denim), 0) as washed_sand_denim,
        COALESCE(SUM(red_sandwich_cap), 0) as red_sandwich_cap
       FROM hat_inventory_record
       WHERE status = 0`
    );

    const transitData = transitResult[0] || {
      washed_black_denim: 0,
      washed_sand_denim: 0,
      red_sandwich_cap: 0,
    };

    // 查询15天前到5天前中间10天所有status=1的数据聚合
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const [recentResult] = await db.query(
      `SELECT
        COALESCE(SUM(washed_black_denim), 0) as washed_black_denim,
        COALESCE(SUM(washed_sand_denim), 0) as washed_sand_denim,
        COALESCE(SUM(red_sandwich_cap), 0) as red_sandwich_cap
       FROM hat_inventory_record
       WHERE status = 2
       AND record_date >= ?
       AND record_date <= ?`,
      [fifteenDaysAgo.toISOString().split("T")[0], fiveDaysAgo.toISOString().split("T")[0]]
    );

    const recentData = recentResult[0] || {
      washed_black_denim: 0,
      washed_sand_denim: 0,
      red_sandwich_cap: 0,
    };

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
      `SELECT COUNT(*) as total FROM hat_inventory_record WHERE ${whereClause}`,
      params
    );

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limitNum);

    // 查询记录（分页）
    const [records] = await db.query(
      `SELECT id, record_date, status, washed_black_denim, washed_sand_denim, red_sandwich_cap, remark, image_urls, created_at, updated_at
       FROM hat_inventory_record
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
          washed_black_denim: 0,
          washed_sand_denim: 0,
          red_sandwich_cap: 0,
          updated_at: null,
        },
        transit: transitData,
        recent: recentData,
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
    console.error("获取帽子库存数据失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getHatInventory;
