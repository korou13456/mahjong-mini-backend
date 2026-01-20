// 获取卫衣库存数据（总量表 + 记录表）
const db = require("../../../../config/database");

async function getSweatshirtInventory(req, res) {
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
      `SELECT id,
              black_s, black_m, black_l, black_xl, black_xxl, black_3xl, black_4xl, black_5xl,
              gray_s, gray_m, gray_l, gray_xl, gray_xxl, gray_3xl, gray_4xl, gray_5xl,
              navy_s, navy_m, navy_l, navy_xl, navy_xxl, navy_3xl, navy_4xl, navy_5xl,
              white_s, white_m, white_l, white_xl, white_xxl, white_3xl, white_4xl, white_5xl,
              updated_at
       FROM sweatshirt_inventory
       LIMIT 1`
    );

    // 查询在路上数据（status=0）的聚合
    const [transitResult] = await db.query(
      `SELECT
        COALESCE(SUM(black_s), 0) as black_s,
        COALESCE(SUM(black_m), 0) as black_m,
        COALESCE(SUM(black_l), 0) as black_l,
        COALESCE(SUM(black_xl), 0) as black_xl,
        COALESCE(SUM(black_xxl), 0) as black_xxl,
        COALESCE(SUM(black_3xl), 0) as black_3xl,
        COALESCE(SUM(black_4xl), 0) as black_4xl,
        COALESCE(SUM(black_5xl), 0) as black_5xl,
        COALESCE(SUM(gray_s), 0) as gray_s,
        COALESCE(SUM(gray_m), 0) as gray_m,
        COALESCE(SUM(gray_l), 0) as gray_l,
        COALESCE(SUM(gray_xl), 0) as gray_xl,
        COALESCE(SUM(gray_xxl), 0) as gray_xxl,
        COALESCE(SUM(gray_3xl), 0) as gray_3xl,
        COALESCE(SUM(gray_4xl), 0) as gray_4xl,
        COALESCE(SUM(gray_5xl), 0) as gray_5xl,
        COALESCE(SUM(navy_s), 0) as navy_s,
        COALESCE(SUM(navy_m), 0) as navy_m,
        COALESCE(SUM(navy_l), 0) as navy_l,
        COALESCE(SUM(navy_xl), 0) as navy_xl,
        COALESCE(SUM(navy_xxl), 0) as navy_xxl,
        COALESCE(SUM(navy_3xl), 0) as navy_3xl,
        COALESCE(SUM(navy_4xl), 0) as navy_4xl,
        COALESCE(SUM(navy_5xl), 0) as navy_5xl,
        COALESCE(SUM(white_s), 0) as white_s,
        COALESCE(SUM(white_m), 0) as white_m,
        COALESCE(SUM(white_l), 0) as white_l,
        COALESCE(SUM(white_xl), 0) as white_xl,
        COALESCE(SUM(white_xxl), 0) as white_xxl,
        COALESCE(SUM(white_3xl), 0) as white_3xl,
        COALESCE(SUM(white_4xl), 0) as white_4xl,
        COALESCE(SUM(white_5xl), 0) as white_5xl
       FROM sweatshirt_inventory_record
       WHERE status = 0`
    );

    const transitData = transitResult[0] || {
      black_s: 0, black_m: 0, black_l: 0, black_xl: 0, black_xxl: 0, black_3xl: 0, black_4xl: 0, black_5xl: 0,
      gray_s: 0, gray_m: 0, gray_l: 0, gray_xl: 0, gray_xxl: 0, gray_3xl: 0, gray_4xl: 0, gray_5xl: 0,
      navy_s: 0, navy_m: 0, navy_l: 0, navy_xl: 0, navy_xxl: 0, navy_3xl: 0, navy_4xl: 0, navy_5xl: 0,
      white_s: 0, white_m: 0, white_l: 0, white_xl: 0, white_xxl: 0, white_3xl: 0, white_4xl: 0, white_5xl: 0,
    };

    // 查询15天前到5天前中间10天所有status=1的数据聚合
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const [recentResult] = await db.query(
      `SELECT
        COALESCE(SUM(black_s), 0) as black_s,
        COALESCE(SUM(black_m), 0) as black_m,
        COALESCE(SUM(black_l), 0) as black_l,
        COALESCE(SUM(black_xl), 0) as black_xl,
        COALESCE(SUM(black_xxl), 0) as black_xxl,
        COALESCE(SUM(black_3xl), 0) as black_3xl,
        COALESCE(SUM(black_4xl), 0) as black_4xl,
        COALESCE(SUM(black_5xl), 0) as black_5xl,
        COALESCE(SUM(gray_s), 0) as gray_s,
        COALESCE(SUM(gray_m), 0) as gray_m,
        COALESCE(SUM(gray_l), 0) as gray_l,
        COALESCE(SUM(gray_xl), 0) as gray_xl,
        COALESCE(SUM(gray_xxl), 0) as gray_xxl,
        COALESCE(SUM(gray_3xl), 0) as gray_3xl,
        COALESCE(SUM(gray_4xl), 0) as gray_4xl,
        COALESCE(SUM(gray_5xl), 0) as gray_5xl,
        COALESCE(SUM(navy_s), 0) as navy_s,
        COALESCE(SUM(navy_m), 0) as navy_m,
        COALESCE(SUM(navy_l), 0) as navy_l,
        COALESCE(SUM(navy_xl), 0) as navy_xl,
        COALESCE(SUM(navy_xxl), 0) as navy_xxl,
        COALESCE(SUM(navy_3xl), 0) as navy_3xl,
        COALESCE(SUM(navy_4xl), 0) as navy_4xl,
        COALESCE(SUM(navy_5xl), 0) as navy_5xl,
        COALESCE(SUM(white_s), 0) as white_s,
        COALESCE(SUM(white_m), 0) as white_m,
        COALESCE(SUM(white_l), 0) as white_l,
        COALESCE(SUM(white_xl), 0) as white_xl,
        COALESCE(SUM(white_xxl), 0) as white_xxl,
        COALESCE(SUM(white_3xl), 0) as white_3xl,
        COALESCE(SUM(white_4xl), 0) as white_4xl,
        COALESCE(SUM(white_5xl), 0) as white_5xl
       FROM sweatshirt_inventory_record
       WHERE status = 2
       AND record_date >= ?
       AND record_date <= ?`,
      [fifteenDaysAgo.toISOString().split("T")[0], fiveDaysAgo.toISOString().split("T")[0]]
    );

    const recentData = recentResult[0] || {
      black_s: 0, black_m: 0, black_l: 0, black_xl: 0, black_xxl: 0, black_3xl: 0, black_4xl: 0, black_5xl: 0,
      gray_s: 0, gray_m: 0, gray_l: 0, gray_xl: 0, gray_xxl: 0, gray_3xl: 0, gray_4xl: 0, gray_5xl: 0,
      navy_s: 0, navy_m: 0, navy_l: 0, navy_xl: 0, navy_xxl: 0, navy_3xl: 0, navy_4xl: 0, navy_5xl: 0,
      white_s: 0, white_m: 0, white_l: 0, white_xl: 0, white_xxl: 0, white_3xl: 0, white_4xl: 0, white_5xl: 0,
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
      `SELECT COUNT(*) as total FROM sweatshirt_inventory_record WHERE ${whereClause}`,
      params
    );

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limitNum);

    // 查询记录（分页）
    const [records] = await db.query(
      `SELECT id, record_date, status,
              black_s, black_m, black_l, black_xl, black_xxl, black_3xl, black_4xl, black_5xl,
              gray_s, gray_m, gray_l, gray_xl, gray_xxl, gray_3xl, gray_4xl, gray_5xl,
              navy_s, navy_m, navy_l, navy_xl, navy_xxl, navy_3xl, navy_4xl, navy_5xl,
              white_s, white_m, white_l, white_xl, white_xxl, white_3xl, white_4xl, white_5xl,
              remark, image_urls, created_at, updated_at
       FROM sweatshirt_inventory_record
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
          black_s: 0, black_m: 0, black_l: 0, black_xl: 0, black_xxl: 0, black_3xl: 0, black_4xl: 0, black_5xl: 0,
          gray_s: 0, gray_m: 0, gray_l: 0, gray_xl: 0, gray_xxl: 0, gray_3xl: 0, gray_4xl: 0, gray_5xl: 0,
          navy_s: 0, navy_m: 0, navy_l: 0, navy_xl: 0, navy_xxl: 0, navy_3xl: 0, navy_4xl: 0, navy_5xl: 0,
          white_s: 0, white_m: 0, white_l: 0, white_xl: 0, white_xxl: 0, white_3xl: 0, white_4xl: 0, white_5xl: 0,
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
    console.error("获取卫衣库存数据失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getSweatshirtInventory;
