const db = require("../../config/database");

async function getOrderProductAggregate(req, res) {
  try {
    const {
      start_date,
      end_date,
      department,
      staff_name,
      category,
      specification,
      page = 1,
      page_size = 20,
    } = req.query;

    const variation = specification;

    const conditions = [];
    const params = [];

    // 日期条件
    if (start_date) {
      conditions.push("data_time >= ?");
      params.push(start_date);
    }
    if (end_date) {
      conditions.push("data_time <= ?");
      params.push(end_date);
    }

    // 部门（参数优先）
    const finalDepartment = department;
    if (finalDepartment) {
      conditions.push("department = ?");
      params.push(finalDepartment);
    }

    // 员工（参数优先）
    const finalStaffName = staff_name;
    if (finalStaffName) {
      conditions.push("staff_name = ?");
      params.push(finalStaffName);
    }

    // 品类筛选
    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }

    // 尺码筛选
    if (variation) {
      conditions.push("variation = ?");
      params.push(variation);
    }

    const whereClause =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // 分页
    const pageNum = Math.max(parseInt(page), 1);
    const pageSize = Math.max(parseInt(page_size), 1);
    const offset = (pageNum - 1) * pageSize;

    // 并行查询
    const countSql = `SELECT COUNT(*) AS total FROM order_product_aggregate ${whereClause}`;
    const summarySql = `SELECT SUM(quantity) AS total_quantity, SUM(price) AS total_sales_amount FROM order_product_aggregate ${whereClause}`;
    const listSql = `SELECT id, category, variation, quantity, price, department, staff_name, data_time, created_at, updated_at FROM order_product_aggregate ${whereClause} ORDER BY data_time DESC LIMIT ? OFFSET ?`;
    const departmentsSql = `SELECT DISTINCT department FROM order_product_aggregate ORDER BY department`;
    const staffNamesSql = `SELECT DISTINCT staff_name FROM order_product_aggregate ORDER BY staff_name`;
    const categoriesSql = `SELECT DISTINCT category FROM order_product_aggregate ORDER BY category`;
    const variationsSql = `SELECT DISTINCT category, variation FROM order_product_aggregate ORDER BY category, variation`;

    const [
      [[{ total }]],
      [[summaryRows]],
      [list],
      [departments],
      [staffNames],
      [categories],
      [variations],
    ] = await Promise.all([
      db.query(countSql, params),
      db.query(summarySql, params),
      db.query(listSql, [...params, pageSize, offset]),
      db.query(departmentsSql),
      db.query(staffNamesSql),
      db.query(categoriesSql),
      db.query(variationsSql),
    ]);

    console.log("查询结果:", {
      total,
      summaryRows,
      list,
      departments,
      staffNames,
      categories,
      variations,
    });

    // 按品类分组尺码
    const categorySpecifications = {};
    variations.forEach(({ category, variation }) => {
      if (!categorySpecifications[category]) {
        categorySpecifications[category] = [];
      }
      categorySpecifications[category].push(variation);
    });

    res.json({
      code: 200,
      message: "查询成功",
      data: {
        filter_options: {
          departments: departments.map((d) => d.department),
          staff_names: staffNames.map((s) => s.staff_name),
          categories: categories.map((c) => c.category),
          categorySpecifications,
        },
        summary: {
          total_quantity: parseFloat(summaryRows?.total_quantity || 0),
          total_sales_amount: parseFloat(summaryRows?.total_sales_amount || 0),
        },
        list,
        pagination: {
          page: pageNum,
          page_size: pageSize,
          total: total || 0,
          total_pages: total > 0 ? Math.ceil(total / pageSize) : 0,
        },
      },
    });
  } catch (error) {
    console.error("查询订单商品聚合数据失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getOrderProductAggregate;
