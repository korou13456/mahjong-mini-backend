const db = require("../../config/database");

module.exports = async (req, res) => {
  try {
    const {
      page = 1,
      page_size = 20,
      order_status,
      order_settlement_status,
      purchase_date_start,
      purchase_date_end,
      start_date,
      end_date,
      department,
      staff_name,
      category,
      variation,
      store_name,
      has_payment,
    } = req.query;

    // 兼容不同的时间参数名
    const purchaseDateStart = purchase_date_start || start_date;
    const purchaseDateEnd = purchase_date_end || end_date;

    // 转换为数字
    const pageNum = parseInt(page, 10) || 1;
    const pageSize = parseInt(page_size, 10) || 20;
    const offset = (pageNum - 1) * pageSize;

    // 构建查询条件
    const conditions = [];
    const params = [];

    if (order_status) {
      conditions.push("order_status = ?");
      params.push(order_status);
    }

    if (order_settlement_status) {
      conditions.push("order_settlement_status = ?");
      params.push(order_settlement_status);
    }

    if (purchaseDateStart) {
      conditions.push("purchase_date_china >= ?");
      params.push(purchaseDateStart);
    }

    if (purchaseDateEnd) {
      conditions.push("purchase_date_china <= ?");
      params.push(purchaseDateEnd);
    }

    if (department) {
      conditions.push("department = ?");
      params.push(department);
    }

    if (staff_name) {
      conditions.push("staff_name = ?");
      params.push(staff_name);
    }

    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }

    if (variation) {
      conditions.push("variation = ?");
      params.push(variation);
    }

    if (store_name) {
      conditions.push("store_name LIKE ?");
      params.push(`%${store_name}%`);
    }

    // 是否有回款筛选
    if (has_payment !== undefined && has_payment !== "") {
      if (has_payment === "true") {
        conditions.push("paid_amount != 0");
      } else if (has_payment === "false") {
        conditions.push("paid_amount = 0");
      }
    }

    // 构建 WHERE 子句
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 查询总数
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM order_detail_aggregate ${whereClause}`,
      params,
    );
    const total = countResult[0].total;

    // 查询 summary 数据
    const [summaryResult] = await db.query(
      `SELECT 
        SUM(quantity) as quantity,
        SUM(paid_amount) as paid_amount,
        SUM(shipping_cost) as shipping_cost,
        SUM(shipping_subsidy) as shipping_subsidy,
        SUM(platform_penalty) as platform_penalty,
        SUM(return_loss) as return_loss,
        SUM(order_amount) as order_amount,
        SUM(total_amount) as total_amount
      FROM order_detail_aggregate ${whereClause}`,
      params,
    );

    const summary = {
      quantity: summaryResult[0].quantity || 0,
      paid_amount: summaryResult[0].paid_amount || 0,
      shipping_cost: summaryResult[0].shipping_cost || 0,
      shipping_subsidy: summaryResult[0].shipping_subsidy || 0,
      platform_penalty: summaryResult[0].platform_penalty || 0,
      return_loss: summaryResult[0].return_loss || 0,
      order_amount: summaryResult[0].order_amount || 0,
      total_amount: summaryResult[0].total_amount || 0,
    };

    // 查询数据，按 purchase_date_china 倒序
    const [data] = await db.query(
      `SELECT * FROM order_detail_aggregate ${whereClause} ORDER BY purchase_date_china DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    // 查询所有可选项
    const [orderStatuses] = await db.query(
      "SELECT DISTINCT order_status FROM order_detail_aggregate WHERE order_status IS NOT NULL ORDER BY order_status",
    );
    const [settlementStatuses] = await db.query(
      "SELECT DISTINCT order_settlement_status FROM order_detail_aggregate WHERE order_settlement_status IS NOT NULL ORDER BY order_settlement_status",
    );
    const [departments] = await db.query(
      "SELECT DISTINCT department FROM order_detail_aggregate WHERE department IS NOT NULL ORDER BY department",
    );
    const [staffNames] = await db.query(
      "SELECT DISTINCT staff_name FROM order_detail_aggregate WHERE staff_name IS NOT NULL ORDER BY staff_name",
    );
    const [storeNames] = await db.query(
      "SELECT DISTINCT store_name FROM order_detail_aggregate WHERE store_name IS NOT NULL ORDER BY store_name",
    );

    // 获取品类
    const [categories] = await db.query(
      "SELECT DISTINCT category FROM order_detail_aggregate WHERE category IS NOT NULL ORDER BY category",
    );
    const categoryList = categories.map((item) => item.category);

    // 获取每个品类对应的规格
    const categorySpecifications = {};
    for (const cat of categoryList) {
      const [variations] = await db.query(
        "SELECT DISTINCT variation FROM order_detail_aggregate WHERE category = ? AND variation IS NOT NULL ORDER BY variation",
        [cat],
      );
      categorySpecifications[cat] = variations.map((item) => item.variation);
    }

    res.json({
      code: 200,
      message: "获取订单明细聚合数据成功",
      data: {
        list: data,
        summary,
        pagination: {
          page: pageNum,
          page_size: pageSize,
          total,
          total_pages: Math.ceil(total / pageSize),
        },
        options: {
          orderStatuses: orderStatuses.map((item) => item.order_status),
          settlementStatuses: settlementStatuses.map(
            (item) => item.order_settlement_status,
          ),
          departments: departments.map((item) => item.department),
          staffNames: staffNames.map((item) => item.staff_name),
          storeNames: storeNames.map((item) => item.store_name),
          categories: categoryList,
          categorySpecifications,
        },
      },
    });
  } catch (error) {
    console.error("获取订单明细聚合数据失败:", error);
    res.status(500).json({
      code: 500,
      message: "获取订单明细聚合数据失败",
      error: error.message,
    });
  }
};
